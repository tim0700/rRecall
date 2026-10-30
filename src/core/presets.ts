import type { CallUsage, ModelChoice, Role, Settings } from './types';
import type { PresetInfo } from './api';
import { failure } from './errors';

// Verified gateway model list and USD / 1M token prices, 2026-10-29:
// docs/checks/chatkhu-2026-10-29.md. One credit = USD 0.001.
const flash: ModelChoice = { provider: 'gemini', model: 'gemini-3.8-flash' };
const haiku: ModelChoice = { provider: 'claude', model: 'claude-haiku-5-5' };
const sonnet: ModelChoice = { provider: 'claude', model: 'claude-sonnet-5-5' };
const all = (choice: ModelChoice): Record<Role, ModelChoice> => ({
  digest: { ...choice },
  skeleton: { ...choice },
  reading: { ...choice },
  tutor: { ...choice },
});
export function listPresets(): PresetInfo[] {
  // Workload estimates from design §5.1; not a quote or a measured per-lecture bill.
  return [
    {
      id: 'saver',
      label: '절약',
      description: '크레딧을 아끼며 모든 단계를 진행해요.',
      models: all(haiku),
      creditsPerLecture: 20,
      creditsPerTutorSession: 13,
    },
    {
      id: 'standard',
      label: '기본',
      description: '강의와 필기는 Gemini로, 질문과 대화는 Haiku로 처리해요.',
      models: { ...all(flash), tutor: { ...haiku } },
      creditsPerLecture: 95,
      creditsPerTutorSession: 13,
    },
    {
      id: 'quality',
      label: '고품질',
      description: '모든 단계에 Sonnet을 사용하며 크레딧이 더 들어요.',
      models: all(sonnet),
      creditsPerLecture: 345,
      creditsPerTutorSession: 373,
    },
  ];
}
export function candidateModels(_role: Role): ModelChoice[] {
  return [flash, haiku, sonnet].map((x) => ({ ...x }));
}
export function resolveModel(settings: Settings, role: Role): ModelChoice {
  const choice =
    settings.overrides[role] ?? listPresets().find((p) => p.id === settings.preset)?.models[role];
  if (
    !choice ||
    !candidateModels(role).some((c) => c.model === choice.model && c.provider === choice.provider)
  )
    throw failure('not-found');
  return { ...choice };
}
export function defaultSettings(): Settings {
  return { preset: 'standard', overrides: {}, outputLanguage: 'ko', rememberKey: true };
}
export function estimateCredits(usage: CallUsage): number | undefined {
  const prices: Record<string, [number, number, number, number]> = {
    [flash.model]: [0.75, 3.75, 0.075, 0],
    [haiku.model]: [0.1, 0.5, 0.01, 0.125],
    [sonnet.model]: [2, 10, 0.2, 2.5],
  };
  const price = prices[usage.model];
  if (!price || usage.inputTokens === undefined || usage.outputTokens === undefined)
    return undefined;
  const read = usage.cacheReadTokens ?? 0;
  // Gemini includes cache hits in promptTokenCount. Claude input_tokens excludes them.
  const input =
    usage.model === flash.model ? Math.max(0, usage.inputTokens - read) : usage.inputTokens;
  return (
    (input * price[0] +
      ((usage.outputTokens ?? 0) + (usage.thoughtTokens ?? 0)) * price[1] +
      read * price[2] +
      (usage.cacheWriteTokens ?? 0) * price[3]) /
    1000
  );
}
