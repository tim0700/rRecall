import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  applyReview,
  clearKey,
  decodeBundle,
  defaultSettings,
  dueWeakPoints,
  encodeBundle,
  gradeAnswer,
  readRecall,
  reviewProgress,
  sessionTitle,
  sessionTopic,
  setKey,
  skeletonHintBank,
} from './api';
import { guardReadingGaps } from './recall';
import {
  claudeResponse,
  geminiResponse,
  noteFixture,
  now,
  skeletonFixture,
  weakFixture,
} from './test-fixtures';
import type { ReadingGap } from './types';

const settings = defaultSettings();
const at = (day: number) => new Date(2026, 9, day, 12);
beforeEach(() => setKey('test-key', false));
afterEach(() => {
  clearKey();
  vi.unstubAllGlobals();
});

it('mixes only other-bundle distractors with unique own terms in stable order without mutation', () => {
  const skeleton = skeletonFixture();
  skeleton.bundles[0].wordBank = ['concept', 'CONCEPT!', 'omega'];
  skeleton.bundles.push(
    { title: 'Second', wordBank: ['CONCEPT', 'beta', 'BETA!', 'alpha'], blanks: [] },
    { title: 'Third', wordBank: ['gamma'], blanks: [] },
  );
  const snapshot = structuredClone(skeleton);
  expect(skeletonHintBank(skeleton, 0)).toEqual(['alpha', 'beta', 'concept', 'omega']);
  expect(skeletonHintBank(structuredClone(skeleton), 0)).toEqual(skeletonHintBank(skeleton, 0));
  expect(skeleton).toEqual(snapshot);
  expect(skeletonHintBank(skeleton, 99)).toEqual([]);
});
it('uses available distractors only and works with a single bundle', () => {
  const skeleton = skeletonFixture();
  expect(skeletonHintBank(skeleton, 0)).toEqual(['concept']);
  skeleton.bundles.push({ title: 'Other', wordBank: ['concept', 'beta'], blanks: [] });
  expect(skeletonHintBank(skeleton, 0)).toEqual(['beta', 'concept']);
});

it.each([true, false])(
  'practice correctness=%s never advances progress or postpones due dates',
  (correct) => {
    const original = { ...weakFixture(), createdAt: at(1).toISOString() };
    let wp = applyReview(original, correct, at(2), 'rewrite', { step: 1, practice: true });
    wp = applyReview(wp, true, at(3), 'follow-up', { step: 2, practice: true });
    expect(wp.reviews.every((review) => review.practice)).toBe(true);
    expect(wp.resolvedAt).toBeUndefined();
    expect(reviewProgress(wp)).toEqual({ step: 1, correctDays: 0 });
    expect(dueWeakPoints([wp], at(3))).toEqual([wp]);
    const counted = applyReview(original, true, at(2), 'real', { step: 1 });
    const after = applyReview(counted, correct, at(4), 'rewrite', { step: 2, practice: true });
    expect(after.resolvedAt).toBeUndefined();
    expect(reviewProgress(after)).toEqual(reviewProgress(counted));
    expect(dueWeakPoints([after], at(5))).toEqual([after]);
  },
);
it.each([true, false])('practice correctness=%s never consumes or reopens retention', (correct) => {
  const original = {
    ...weakFixture(),
    createdAt: at(1).toISOString(),
    resolvedAt: at(5).toISOString(),
  };
  const wp = applyReview(original, correct, at(27), 'practice', { step: 2, practice: true });
  expect(wp.resolvedAt).toBe(original.resolvedAt);
  expect(wp.retainedAt).toBeUndefined();
  expect(wp.reviews[0].retention).toBeUndefined();
  expect(dueWeakPoints([wp], at(27))).toEqual([wp]);
});
it('excludes explicit imported quick checks even after creation day', () => {
  const wp = {
    ...weakFixture(),
    createdAt: at(1).toISOString(),
    reviews: [
      { date: at(2).toISOString(), correct: true, step: 1 as const, quick: true },
      { date: at(3).toISOString(), correct: true, step: 2 as const, quick: true },
    ],
  };
  expect(reviewProgress(wp)).toEqual({ step: 1, correctDays: 0 });
  expect(dueWeakPoints([wp], at(3))).toEqual([wp]);
});

const gap = (concept: string, changes: Partial<Omit<ReadingGap, 'id'>> = {}) => ({
  concept,
  why: 'Meaning missing',
  kind: 'concept' as const,
  source: 'paper' as const,
  noteSection: 'Topic',
  uncertain: false,
  ...changes,
});
it('drops a lumped gap and unrelated labels while retaining normalized scoped and self-flagged gaps', () => {
  const gaps = [
    gap('용어 의미 (own-words meaning)'),
    gap('Unrelated'),
    gap('ＣＯＮＣＥＰＴ!'),
    gap('Topic reconstruction'),
    gap('Earlier question'),
    gap('Personal uncertainty', { kind: 'self-flagged' }),
  ];
  expect(
    guardReadingGaps(gaps, noteFixture(), skeletonFixture(), ['Earlier question about a detail']),
  ).toEqual(gaps.slice(2));
});
it('enforces terms-only guidance without deleting self-flags, missing terms or asked candidates', async () => {
  const gaps = [
    gap('concept'),
    gap('concept', { kind: 'term' }),
    gap('concept', { kind: 'corrected' }),
    gap('Unmapped uncertainty', { kind: 'self-flagged' }),
    gap('concept', { source: 'asked' }),
  ];
  const fetcher = vi.fn().mockResolvedValue(
    geminiResponse({
      recalled: [],
      corrected: [],
      gaps,
      meaningLinesMissing: true,
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const result = await readRecall({
    photos: [],
    typedText: 'concept',
    note: noteFixture(),
    skeleton: skeletonFixture(),
    settings,
  });
  expect(result.value.meaningLinesMissing).toBe(true);
  expect(result.value.promptVersion).toBe('reading-v5');
  expect(
    result.value.gaps.map(({ id, ...rest }) => {
      expect(id).toBeTruthy();
      return rest;
    }),
  ).toEqual(gaps.slice(1));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([undefined, false, 'invalid'])(
  'keeps optional missing-meaning flag %s compatible without retries',
  async (flag) => {
    const fetcher = vi.fn().mockResolvedValue(
      geminiResponse({
        recalled: [],
        corrected: [],
        gaps: [gap('concept')],
        ...(flag === undefined ? {} : { meaningLinesMissing: flag }),
      }),
    );
    vi.stubGlobal('fetch', fetcher);
    const result = await readRecall({
      photos: [],
      note: noteFixture(),
      skeleton: skeletonFixture(),
      settings,
    });
    expect(result.value.gaps).toHaveLength(1);
    expect(result.value.meaningLinesMissing).toBe(flag === false ? false : undefined);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it.each([2, 3] as const)('ignores missing-meaning flag outside level 1 (%s)', async (level) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        geminiResponse({
          recalled: [],
          corrected: [],
          gaps: [gap('concept')],
          meaningLinesMissing: true,
        }),
      ),
  );
  const result = await readRecall({
    photos: [],
    level,
    note: noteFixture(),
    skeleton: skeletonFixture(),
    settings,
  });
  expect(result.value.meaningLinesMissing).toBe(false);
  expect(result.value.gaps).toHaveLength(1);
});
it('grades an incorrect empty-reference follow-up once using note evidence', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      claudeResponse({
        correct: false,
        feedback: '다시 생각해 보세요.',
        missing: [],
        hint: '구성에 주목해 보세요.',
        followUp: '',
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = await gradeAnswer({
    question: {
      id: 'follow-up',
      weakPointId: 'wp1',
      kind: 'connect',
      prompt: 'How are the parts related?',
      answer: '',
      evidence: '',
    },
    answer: 'Unsure',
    note: noteFixture(),
    settings,
  });
  expect(result.value.correct).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(JSON.parse(body.messages[0].content[0].text)).toMatchObject({
    referenceAnswer: '',
    learnerAnswer: 'Unsure',
    note: noteFixture(),
  });
  expect(body.system[0].text).toContain('If referenceAnswer is empty');
});
it('generates a short Korean topic with one tutor call and a 60-token budget', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(claudeResponse('“부분 사이의 관계를 살펴보는 아주 긴 제목입니다”', true));
  vi.stubGlobal('fetch', fetcher);
  const result = await sessionTopic('First question', 'First reply', settings);
  expect(Array.from(result.value)).toHaveLength(18);
  expect(result.value).not.toMatch(/[“”]/u);
  expect(result.usage).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.max_tokens).toBe(60);
  expect(JSON.parse(body.messages[0].content[0].text)).toEqual({
    firstQuestion: 'First question',
    firstReply: 'First reply',
  });
});
it.each(['', '  ', 'English only'])(
  'falls back without a shape retry on unusable title %j',
  async (title) => {
    const fetcher = vi.fn().mockResolvedValue(claudeResponse(title, true));
    vi.stubGlobal('fetch', fetcher);
    const first = '첫 질문의 내용을 오래 기억할 수 있도록 설명해 주세요.';
    const result = await sessionTopic(first, 'Reply', settings);
    expect(result.value).toBe(sessionTitle(first));
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
it('falls back when title authorization fails without losing the chat', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  expect(await sessionTopic('첫 질문', 'Reply', settings)).toEqual({ value: '첫 질문', usage: [] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('round-trips additive fields with backup version 1', async () => {
  const bundle = await encodeBundle(
    {
      courses: [],
      chats: [],
      questions: [],
      lectures: [
        {
          id: 'l',
          courseId: 'c',
          title: 'Synthetic',
          date: now,
          transcript: [],
          materialFileIds: [],
          recalls: [
            {
              id: 'r',
              date: now,
              photoFileIds: [],
              reading: {
                recalled: [],
                corrected: [],
                gaps: [],
                meaningLinesMissing: true,
                model: 'test',
                promptVersion: 'reading-v5',
                createdAt: now,
              },
            },
          ],
        },
      ],
      weakPoints: [applyReview(weakFixture(), true, at(2), 'q', { practice: true })],
      attempts: [
        {
          id: 'a',
          questionId: 'q',
          weakPointId: 'wp1',
          answer: 'Practice',
          grade: { correct: true, feedback: '확인했어요.', missing: [] },
          at: now,
          practice: true,
        },
      ],
    },
    [],
    new Date(now),
  );
  expect(decodeBundle(JSON.stringify(bundle)).bundle).toEqual(bundle);
  expect(bundle.version).toBe(1);
});
