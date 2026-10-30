import { blobToBase64 } from './binary';
import { failure } from './errors';
import type { GenerationInput, GenerationOutput } from './generation';
import { isNumber, isObject, requestJSON } from './gateway';
import { estimateCredits } from './presets';
import type { CallUsage } from './types';

export async function generateClaude(input: GenerationInput): Promise<GenerationOutput> {
  const attachments = await Promise.all(
    (input.files ?? []).map(async (file) => ({
      type: file.mime === 'application/pdf' ? 'document' : 'image',
      source: {
        type: 'base64',
        media_type: file.mime || file.blob.type,
        data: await blobToBase64(file.blob),
      },
    })),
  );
  const data = await requestJSON('/claude/v1/messages/', {
    provider: 'claude',
    signal: input.signal,
    body: {
      model: input.choice.model,
      max_tokens: input.maxTokens,
      system: [{ type: 'text', text: input.system, cache_control: { type: 'ephemeral' } }],
      messages: input.messages.map((m, i) => ({
        role: m.role,
        content: [
          ...(i === input.messages.length - 1 ? attachments : []),
          { type: 'text', text: m.text },
        ],
      })),
      ...(input.schema
        ? { output_config: { format: { type: 'json_schema', schema: input.schema } } }
        : {}),
    },
  });
  if (!isObject(data) || !Array.isArray(data.content)) throw failure('bad-response');
  const text = data.content
    .filter(isObject)
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) throw failure('bad-response');
  const meta = isObject(data.usage) ? data.usage : {};
  const usage: CallUsage = {
    role: input.role,
    model: input.choice.model,
    at: new Date().toISOString(),
  };
  for (const [target, source] of [
    ['inputTokens', 'input_tokens'],
    ['outputTokens', 'output_tokens'],
    ['cacheReadTokens', 'cache_read_input_tokens'],
    ['cacheWriteTokens', 'cache_creation_input_tokens'],
  ] as const)
    if (isNumber(meta[source]) && meta[source] >= 0) usage[target] = meta[source];
  usage.estimatedCredits = estimateCredits(usage);
  return { text, usage };
}
