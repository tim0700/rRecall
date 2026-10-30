import { blobToBase64 } from './binary';
import { failure } from './errors';
import type { GenerationInput, GenerationOutput } from './generation';
import { isNumber, isObject, requestJSON } from './gateway';
import { estimateCredits } from './presets';
import type { CallUsage } from './types';

export async function generateGemini(input: GenerationInput): Promise<GenerationOutput> {
  const attachments = await Promise.all(
    (input.files ?? []).map(async (file) => ({
      inline_data: { mime_type: file.mime || file.blob.type, data: await blobToBase64(file.blob) },
    })),
  );
  const data = await requestJSON(
    `/gemini/v1beta/models/${encodeURIComponent(input.choice.model)}:generateContent`,
    {
      provider: 'gemini',
      signal: input.signal,
      body: {
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.messages.map((m, i) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [...(i === input.messages.length - 1 ? attachments : []), { text: m.text }],
        })),
        generationConfig: {
          maxOutputTokens: input.maxTokens,
          ...(input.schema
            ? { responseMimeType: 'application/json', responseJsonSchema: input.schema }
            : {}),
          ...(input.lowThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      },
    },
  );
  if (!isObject(data) || !Array.isArray(data.candidates)) throw failure('bad-response');
  const candidate: unknown = data.candidates[0];
  if (
    !isObject(candidate) ||
    !isObject(candidate.content) ||
    !Array.isArray(candidate.content.parts)
  )
    throw failure('bad-response');
  const text = candidate.content.parts
    .filter(isObject)
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) throw failure('bad-response');
  const meta = isObject(data.usageMetadata) ? data.usageMetadata : {};
  const usage: CallUsage = {
    role: input.role,
    model: input.choice.model,
    at: new Date().toISOString(),
  };
  for (const [target, source] of [
    ['inputTokens', 'promptTokenCount'],
    ['outputTokens', 'candidatesTokenCount'],
    ['thoughtTokens', 'thoughtsTokenCount'],
    ['cacheReadTokens', 'cachedContentTokenCount'],
  ] as const)
    if (isNumber(meta[source]) && meta[source] >= 0) usage[target] = meta[source];
  usage.estimatedCredits = estimateCredits(usage);
  return { text, usage };
}
