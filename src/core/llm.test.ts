import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  candidateModels,
  clearKey,
  defaultSettings,
  digestNote,
  gradeAnswer,
  listPresets,
  makeQuestions,
  makeSkeleton,
  readRecall,
  resolveModel,
  setKey,
  tutorReply,
  sessionTitle,
} from './api';
import { estimateCredits } from './presets';
import { gradeSchema, noteSchema, parseResponse } from './schemas';
import {
  claudeResponse,
  geminiResponse,
  noteFixture,
  notePayload,
  now,
  skeletonFixture,
  weakFixture,
} from './test-fixtures';
import type { StoredFile } from './types';
const settings = defaultSettings();
const file = (mime: string): StoredFile => ({
  id: 'f',
  name: 'file',
  mime,
  size: 1,
  blob: new Blob(['x'], { type: mime }),
  createdAt: now,
});
const digestInput = () => ({
  lectureTitle: 'Synthetic',
  transcript: [{ text: 'A synthetic concept has two parts.' }],
  materials: [file('application/pdf')],
  settings,
});
const bodyAt = (fetcher: ReturnType<typeof vi.fn>, index = 0) =>
  JSON.parse(fetcher.mock.calls[index][1].body as string);
beforeEach(() => {
  setKey('test-key', false);
});
afterEach(() => {
  clearKey();
  vi.unstubAllGlobals();
});
it('resolves presets and validates advanced choices without sharing mutable defaults', () => {
  expect(listPresets().map((p) => p.id)).toEqual(['saver', 'standard', 'quality']);
  expect(resolveModel(settings, 'skeleton').model).toBe('gemini-3.8-flash');
  expect(resolveModel(settings, 'tutor').model).toBe('claude-haiku-5-5');
  expect(candidateModels('reading')).toHaveLength(3);
  expect(() =>
    resolveModel(
      { ...settings, overrides: { digest: { provider: 'gemini', model: 'invented' } } },
      'digest',
    ),
  ).toThrow();
  const changed = defaultSettings();
  changed.overrides.digest = candidateModels('digest')[0];
  expect(defaultSettings().overrides).toEqual({});
});
it('estimates Gemini inclusive cache and thoughts, and Claude exclusive cache correctly', () => {
  const common = {
    role: 'digest' as const,
    at: now,
    inputTokens: 1000,
    outputTokens: 100,
    thoughtTokens: 20,
    cacheReadTokens: 400,
  };
  expect(estimateCredits({ ...common, model: 'gemini-3.8-flash' })).toBeCloseTo(
    (600 * 0.75 + 120 * 3.75 + 400 * 0.075) / 1000,
  );
  expect(
    estimateCredits({
      ...common,
      thoughtTokens: undefined,
      cacheWriteTokens: 30,
      model: 'claude-haiku-5-5',
    }),
  ).toBeCloseTo((1000 * 0.1 + 100 * 0.5 + 400 * 0.01 + 30 * 0.125) / 1000);
  expect(estimateCredits({ role: 'tutor', at: now, model: 'unknown' })).toBeUndefined();
});
it.each([
  'not json',
  '{"correct":"yes","feedback":"ok","missing":[]}',
  '{"correct":true,"feedback":"ok"}',
  '{"correct":true,"feedback":"ok","missing":[],"secret":"x"}',
])('rejects malformed JSON and incompatible response shapes: %s', (raw) => {
  expect(() => parseResponse(raw, gradeSchema)).toThrow(
    expect.objectContaining({ kind: 'bad-response' }),
  );
});
it('validates nested note fields and evidence cardinality', () => {
  expect(parseResponse(JSON.stringify(notePayload()), noteSchema)).toEqual(notePayload());
  const payload = notePayload();
  payload.sections[0].points[0].evidence = [];
  expect(() => parseResponse(JSON.stringify(payload), noteSchema)).toThrow();
});
it('digests through Gemini native with inline PDF, schema, default thinking and code-owned metadata', async () => {
  const fetcher = vi.fn().mockResolvedValue(geminiResponse(notePayload()));
  vi.stubGlobal('fetch', fetcher);
  const result = await digestNote(digestInput());
  expect(fetcher.mock.calls[0][0]).toContain(
    '/gemini/v1beta/models/gemini-3.8-flash:generateContent',
  );
  const body = bodyAt(fetcher);
  expect(body.contents[0].parts[0]).toEqual({
    inline_data: { mime_type: 'application/pdf', data: 'eA==' },
  });
  expect(body.generationConfig.responseJsonSchema).toBeDefined();
  expect(body.generationConfig.maxOutputTokens).toBe(32000);
  expect(body.systemInstruction.parts[0].text).toContain(
    'Korean, with English terms in parentheses',
  );
  expect(body.generationConfig.thinkingConfig).toBeUndefined();
  expect(result.value.sections[0].points[0].verified).toBe(true);
  expect(result.value.promptVersion).toBe('digest-v4');
  expect(result.usage[0].thoughtTokens).toBe(10);
});
it('routes saver digest to Claude Messages with PDF blocks and no thinking', async () => {
  const fetcher = vi.fn().mockResolvedValue(claudeResponse(notePayload()));
  vi.stubGlobal('fetch', fetcher);
  await digestNote({ ...digestInput(), settings: { ...settings, preset: 'saver' } });
  expect(fetcher.mock.calls[0][0]).toContain('/claude/v1/messages/');
  const body = bodyAt(fetcher);
  expect(body.messages[0].content[0].type).toBe('document');
  expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.thinking).toBeUndefined();
});
it('retries a malformed generated shape once and accounts for both returned responses', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(geminiResponse({ wrong: true }))
    .mockResolvedValueOnce(geminiResponse(notePayload()));
  vi.stubGlobal('fetch', fetcher);
  const result = await digestNote(digestInput());
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.usage).toHaveLength(2);
});
it('stops after the second invalid generated response', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(geminiResponse({ wrong: true })));
  vi.stubGlobal('fetch', fetcher);
  await expect(digestNote(digestInput())).rejects.toMatchObject({ kind: 'bad-response' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('repairs an invented note chunk without a second call and keeps annotation provenance', async () => {
  const payload = notePayload();
  payload.sections[0].points[0].fromHandwriting = true;
  payload.sections[0].myHandwriting = [{ text: 'two', where: 'page 1', meaning: 'Two parts' }];
  payload.sections[0].chunk = 'Invented';
  const fetcher = vi.fn().mockResolvedValue(geminiResponse(payload));
  vi.stubGlobal('fetch', fetcher);
  const result = await digestNote(digestInput());
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.value.bigPicture.chunks.map((c) => c.title)).toContain(
    result.value.sections[0].chunk,
  );
  expect(result.value.sections[0].points[0].fromHandwriting).toBe(true);
  expect(result.value.sections[0].myHandwriting).toHaveLength(1);
  expect(result.usage).toHaveLength(1);
});
it('copies section chunks and drops extra definitions in the returned skeleton', async () => {
  const { bundles, examples } = skeletonFixture();
  bundles[0].chunk = 'Model invented chunk';
  bundles[0].definitions!.push({ term: 'extra', definition: 'Unsupported term' });
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ bundles, examples }));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [],
    openWeakPoints: [],
    settings,
  });
  expect(result.value.bundles[0].chunk).toBe(noteFixture().sections[0].chunk);
  expect(result.value.bundles[0].definitions).toEqual(skeletonFixture().bundles[0].definitions);
  expect(result.value.leakWarnings).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('aligns a wrong bundle count to the note sections without a second call', async () => {
  const note = noteFixture();
  const { bundles, examples } = skeletonFixture();
  bundles.push({ ...bundles[0], title: 'Unexpected extra' });
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ bundles, examples }));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({ note, transcript: [], openWeakPoints: [], settings });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.value.bundles.map((b) => b.title)).toEqual(note.sections.map((s) => s.title));
});
it('repairs a renamed title, missing definitions and malformed blanks instead of rejecting', async () => {
  const note = noteFixture();
  const { bundles, examples } = skeletonFixture();
  bundles[0].title = 'Different section';
  bundles[0].definitions = [];
  bundles[0].blanks = [...bundles[0].blanks, { sentence: 'no blank marker here', answer: 'x' }];
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ bundles, examples }));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({ note, transcript: [], openWeakPoints: [], settings });
  expect(result.value.bundles[0].title).toBe(note.sections[0].title);
  expect(result.value.bundles[0].definitions).toEqual([]);
  expect(result.value.bundles[0].blanks.every((b) => b.sentence.includes('___'))).toBe(true);
});
it('keeps a bundle for a section without eligible terms and accepts legacy notes without chunk', async () => {
  const note = noteFixture();
  delete note.sections[0].chunk;
  const { bundles, examples } = skeletonFixture();
  bundles[0] = {
    title: note.sections[0].title,
    chunk: '',
    wordBank: [],
    blanks: [],
    definitions: [],
  };
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ bundles, examples }));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({ note, transcript: [], openWeakPoints: [], settings });
  expect(result.value.bundles).toEqual([{ ...bundles[0], chunk: undefined }]);
});
it('repairs leaks once and retains safe warnings when the repair still leaks', async () => {
  const { bundles, examples } = skeletonFixture();
  bundles[0].blanks[0].sentence = 'concept ___';
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(geminiResponse({ bundles, examples })));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [{ text: 'concept' }],
    openWeakPoints: ['Previous gap'],
    settings,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(bodyAt(fetcher, 1).contents[0].parts[0].text).toContain('leaks');
  expect(result.value.leakWarnings).toHaveLength(1);
  expect(result.value.leakWarnings[0]).not.toContain('concept');
  expect(result.value.weakFromCourse).toEqual([]); // the model did not mark it as related
  expect(result.usage).toHaveLength(2);
});
it('uses one call for a clean skeleton and does not treat the word bank as a leak', async () => {
  const { bundles, examples } = skeletonFixture();
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ bundles, examples }));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [],
    openWeakPoints: [],
    settings,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.value.leakWarnings).toEqual([]);
});
it('reads photos with low thinking and assigns unique gap IDs while preserving uncertainty', async () => {
  const payload = {
    recalled: [{ text: 'some text', concept: 'A', uncertain: false }],
    corrected: [],
    gaps: [
      {
        concept: 'A',
        why: 'unclear',
        kind: 'self-flagged',
        source: 'paper',
        noteSection: 'Topic',
        uncertain: true,
      },
    ],
  };
  const fetcher = vi.fn().mockResolvedValue(geminiResponse(payload));
  vi.stubGlobal('fetch', fetcher);
  const result = await readRecall({
    photos: [file('image/jpeg')],
    typedText: 'some text',
    note: noteFixture(),
    skeleton: skeletonFixture(),
    settings,
  });
  expect(bodyAt(fetcher).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  expect(bodyAt(fetcher).contents[0].parts[0].inline_data.mime_type).toBe('image/jpeg');
  expect(result.value.gaps[0]).toMatchObject({ uncertain: true, id: expect.any(String) });
  expect(JSON.parse(bodyAt(fetcher).contents[0].parts[1].text).level).toBe(1);
  expect(result.value.promptVersion).toBe('reading-v5');
  const data = JSON.parse(bodyAt(fetcher).contents[0].parts[1].text);
  expect(data.learnerText).toBe('some text');
  expect(data).not.toHaveProperty('typedText');
  expect(data.skeleton.bundles[0].blanks[0].answer).toBe('concept');
});
it.each([2, 3] as const)(
  'sends recall level %s with note and definition references',
  async (level) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(geminiResponse({ recalled: [], corrected: [], gaps: [] }));
    vi.stubGlobal('fetch', fetcher);
    await readRecall({
      level,
      photos: [],
      typedText: 'My recall',
      note: noteFixture(),
      skeleton: skeletonFixture(),
      settings,
    });
    expect(JSON.parse(bodyAt(fetcher).contents[0].parts[0].text)).toMatchObject({
      level,
      note: noteFixture(),
      skeleton: skeletonFixture(),
    });
  },
);

it.each(['claude', 'gemini'] as const)(
  'sends only the current session and attaches images to its last user turn via %s',
  async (provider) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        provider === 'claude' ? claudeResponse('Reply', true) : geminiResponse('Reply'),
      );
    vi.stubGlobal('fetch', fetcher);
    const current = [
      { role: 'user' as const, text: 'Current question', at: now },
      { role: 'assistant' as const, text: 'Current answer', at: now },
    ];
    const choice = candidateModels('tutor').find((model) => model.provider === provider)!;
    const result = await tutorReply({
      thread: {
        id: 'session',
        title: 'Current topic',
        createdAt: now,
        courseId: 'c',
        lectureId: 'l',
        purpose: 'before-recall',
        messages: current,
      },
      note: noteFixture(),
      userText: 'Explain this photo',
      images: [file('image/png')],
      pastTopics: ['Earlier topic', 'Earlier topic', '  '],
      settings: { ...settings, overrides: { tutor: choice } },
    });
    const body = bodyAt(fetcher);
    const system =
      provider === 'claude' ? body.system[0].text : body.systemInstruction.parts[0].text;
    expect(system).toContain('Earlier sessions asked about');
    expect(system.match(/Earlier topic/g)).toHaveLength(1);
    expect(system).toContain(noteFixture().sections[0].points[0].text);
    const messages = provider === 'claude' ? body.messages : body.contents;
    const parts = messages.map(
      (message: { content?: unknown[]; parts?: unknown[] }) => message.content ?? message.parts,
    );
    expect(messages).toHaveLength(3);
    expect(parts[0]).toEqual(
      [{ type: 'text', text: 'Current question' }].map((part) =>
        provider === 'claude' ? part : { text: part.text },
      ),
    );
    expect(parts[1]).toHaveLength(1);
    expect(parts[2][0]).toEqual(
      provider === 'claude'
        ? { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'eA==' } }
        : { inline_data: { mime_type: 'image/png', data: 'eA==' } },
    );
    expect(result.usage[0].estimatedCredits).toBeGreaterThan(0);
    expect(current).toHaveLength(2);
  },
);
it('creates a compact session title locally without splitting Unicode code points', () => {
  expect(sessionTitle('  첫 질문\n 내용  ')).toBe('첫 질문 내용');
  expect(sessionTitle('  ')).toBe('');
  expect(sessionTitle('가'.repeat(30))).toBe('가'.repeat(30));
  expect(sessionTitle('😀'.repeat(31))).toBe('😀'.repeat(29) + '…');
});
it('filters questions by evidence and weak-point membership and respects count', async () => {
  const good = {
    weakPointId: 'wp1',
    kind: 'explain',
    step: 1,
    prompt: 'Recall it.',
    answer: 'Two parts',
    evidence: 'A synthetic concept has two parts.',
  };
  const fetcher = vi.fn().mockResolvedValue(
    claudeResponse({
      questions: [good, { ...good, evidence: 'made up' }, { ...good, weakPointId: 'other' }],
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  expect(
    (await makeQuestions({ note: noteFixture(), weakPoints: [weakFixture()], count: 1, settings }))
      .value,
  ).toHaveLength(1);
  expect((await makeQuestions({ note: noteFixture(), weakPoints: [], settings })).value).toEqual(
    [],
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('grades structured answers and chats with the stable note in a cached system block', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      claudeResponse({
        correct: false,
        feedback: '핵심을 다시 떠올려 보세요.',
        missing: ['Idea'],
        hint: '구성 요소를 떠올려 보세요.',
        followUp: '',
      }),
    )
    .mockResolvedValueOnce(claudeResponse('무엇이 기억나나요?', true));
  vi.stubGlobal('fetch', fetcher);
  const result = await gradeAnswer({
    question: {
      id: 'q',
      weakPointId: 'w',
      kind: 'short',
      prompt: 'Recall',
      answer: 'Idea',
      evidence: 'Idea',
    },
    answer: 'No',
    note: noteFixture(),
    settings,
  });
  expect(result.value.correct).toBe(false);
  const reply = await tutorReply({
    thread: { id: 't', courseId: 'c', lectureId: 'l', purpose: 'before-recall', messages: [] },
    note: noteFixture(),
    userText: 'Explain',
    settings,
  });
  const chat = bodyAt(fetcher, 1);
  expect(chat.system[0].text).toContain('A synthetic concept has two parts.');
  expect(chat.output_config).toBeUndefined();
  expect(reply.value).toBe('무엇이 기억나나요?');
  expect(reply.usage[0].cacheReadTokens).toBe(40);
});

it('repairs word-bank mismatches once and uses skeleton-specific Korean instructions', async () => {
  const { bundles, examples } = skeletonFixture();
  bundles[0].blanks[0].answer = '다른 정답';
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(geminiResponse({ bundles, examples })));
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [],
    openWeakPoints: [],
    settings,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.value.promptVersion).toBe('skeleton-v3.2');
  expect(result.value.leakWarnings).toEqual([
    '묶음 1 빈칸 1의 정답이 단어 모음에 없어요. 복습 전에 확인해 주세요.',
  ]);
  expect(bodyAt(fetcher).systemInstruction.parts[0].text).toContain('Korean without English terms');
  expect(bodyAt(fetcher).systemInstruction.parts[0].text).not.toContain(
    'Korean, with English terms in parentheses',
  );
});

it('sends asked topics and preserves paper and asked gap provenance', async () => {
  const gaps = [
    {
      concept: 'Synthetic concept',
      why: 'Learner flagged uncertainty',
      kind: 'self-flagged',
      source: 'paper',
      noteSection: 'Topic',
      uncertain: false,
    },
    {
      concept: 'Synthetic concept',
      why: 'Asked about the meaning',
      kind: 'concept',
      source: 'asked',
      noteSection: 'Topic',
      uncertain: false,
    },
  ];
  const fetcher = vi.fn().mockResolvedValue(geminiResponse({ recalled: [], corrected: [], gaps }));
  vi.stubGlobal('fetch', fetcher);
  const result = await readRecall({
    photos: [],
    note: noteFixture(),
    skeleton: skeletonFixture(),
    askedTopics: ['Earlier title — learner question'],
    settings,
  });
  expect(JSON.parse(bodyAt(fetcher).contents[0].parts[0].text).askedTopics).toEqual([
    'Earlier title — learner question',
  ]);
  expect(
    result.value.gaps.map(({ id, ...gap }) => {
      expect(id).toBeTruthy();
      return gap;
    }),
  ).toEqual(gaps);
});

it.each(['term', 'concept', 'section', 'self-flagged', 'corrected'] as const)(
  'uses the first-step question kind for %s gaps',
  async (gapKind) => {
    const kind = gapKind === 'term' ? 'term' : 'explain';
    const q = {
      weakPointId: 'wp1',
      kind,
      step: 1,
      prompt: 'Recall the requested idea.',
      answer: 'Two parts',
      evidence: noteFixture().sections[0].points[0].text,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        claudeResponse({ questions: [q, { ...q, kind: 'apply' }, { ...q, step: 2 }] }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await makeQuestions({
      weakPoints: [{ ...weakFixture(), gapKind, noteSection: 'Topic' }],
      note: noteFixture(),
      settings,
    });
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({ kind, step: 1 });
    const data = JSON.parse(bodyAt(fetcher).messages[0].content[0].text);
    expect(data.weakPoints[0]).toMatchObject({
      gapKind,
      step: 1,
      noteSections: noteFixture().sections,
    });
  },
);

it('passes only point history and enforces step 2, novelty and answer-leak checks', async () => {
  const q = {
    id: 'old',
    weakPointId: 'wp1',
    kind: 'explain' as const,
    step: 1 as const,
    prompt: 'Explain the idea.',
    answer: 'Two parts',
    evidence: noteFixture().sections[0].points[0].text,
  };
  const a = {
    id: 'attempt',
    questionId: q.id,
    weakPointId: q.weakPointId,
    answer: 'Two parts',
    grade: { correct: true, feedback: '핵심을 짚었어요.', missing: [] },
    at: '2026-10-03T12:00:00Z',
  };
  const fresh = { ...q, kind: 'connect', step: 2, prompt: 'How does it relate to the next topic?' };
  const { id: _id, ...newQuestion } = fresh;
  const fetcher = vi.fn().mockResolvedValue(
    claudeResponse({
      questions: [
        newQuestion,
        { ...newQuestion, kind: 'explain' },
        { ...newQuestion, step: 1 },
        { ...newQuestion, prompt: 'EXPLAIN the idea!' },
        { ...newQuestion, prompt: 'Use ＴＷＯ PARTS here.' },
      ],
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const result = await makeQuestions({
    weakPoints: [{ ...weakFixture(), reviews: [{ date: a.at, correct: true, step: 1 }] }],
    note: noteFixture(),
    previousQuestions: [q, { ...q, id: 'foreign', weakPointId: 'other' }],
    attempts: [a, { ...a, weakPointId: 'other' }],
    settings,
  });
  expect(result.value).toHaveLength(1);
  expect(result.value[0]).toMatchObject(newQuestion);
  const data = JSON.parse(bodyAt(fetcher).messages[0].content[0].text);
  expect(data.weakPoints[0]).toMatchObject({
    gapKind: 'concept',
    step: 2,
    previousQuestions: [{ referenceAnswer: q.answer }],
    attempts: [{ learnerAnswer: a.answer }],
  });
  expect(data.weakPoints[0].previousQuestions[0]).not.toHaveProperty('answer');
  expect(data.weakPoints[0].attempts[0]).not.toHaveProperty('answer');
});

it('grades a wrong first try and a successful hinted retry with scoped history', async () => {
  const first = {
    correct: false,
    feedback: '한 부분이 빠졌어요.',
    missing: ['Two parts'],
    hint: '구성 요소를 세어 보세요.',
    followUp: '',
  };
  const second = {
    correct: true,
    feedback: '두 부분을 모두 설명했어요.',
    missing: [],
    hint: '',
    followUp: '한 부분이 빠지면 어떻게 될까요?',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(claudeResponse(first))
    .mockResolvedValueOnce(claudeResponse(second));
  vi.stubGlobal('fetch', fetcher);
  const question = {
    id: 'q',
    weakPointId: 'wp1',
    kind: 'explain' as const,
    step: 1 as const,
    prompt: 'Explain the idea.',
    answer: 'Two parts',
    evidence: noteFixture().sections[0].points[0].text,
  };
  const input = { question, answer: 'Only one', note: noteFixture(), settings };
  expect((await gradeAnswer(input)).value).toEqual(first);
  const previous = {
    id: 'a',
    questionId: 'q',
    weakPointId: 'wp1',
    answer: input.answer,
    grade: first,
    at: now,
    attemptNumber: 1 as const,
  };
  expect(
    (
      await gradeAnswer({
        ...input,
        answer: 'Two parts',
        previousAttempts: [previous, { ...previous, questionId: 'other' }],
      })
    ).value,
  ).toEqual(second);
  expect(JSON.parse(bodyAt(fetcher).messages[0].content[0].text)).toMatchObject({
    attemptNumber: 1,
    previousAttempts: [],
  });
  const retry = JSON.parse(bodyAt(fetcher, 1).messages[0].content[0].text);
  expect(retry).toMatchObject({
    attemptNumber: 2,
    referenceAnswer: 'Two parts',
    learnerAnswer: 'Two parts',
    previousAttempts: [{ learnerAnswer: previous.answer, questionId: 'q' }],
  });
  expect(retry).not.toHaveProperty('answer');
  expect(retry.question).not.toHaveProperty('answer');
  expect(retry.previousAttempts[0]).not.toHaveProperty('answer');
});

it('accepts old notes without connectors without retrying or adding invented transitions', async () => {
  const fetcher = vi.fn().mockResolvedValue(geminiResponse(notePayload()));
  vi.stubGlobal('fetch', fetcher);
  const result = await digestNote(digestInput());
  expect(result.value.bigPicture).toEqual(notePayload().bigPicture);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps supported connectors and clears the final connector in code', async () => {
  const payload = notePayload();
  payload.bigPicture.chunks[0].toNext = '  The remaining constraint motivates the next method.  ';
  payload.bigPicture.chunks[2].toNext = 'There is no next chunk.';
  const fetcher = vi.fn().mockResolvedValue(geminiResponse(payload));
  vi.stubGlobal('fetch', fetcher);
  const result = await digestNote(digestInput());
  expect(result.value.bigPicture.chunks[0].toNext).toBe(
    'The remaining constraint motivates the next method.',
  );
  expect(result.value.bigPicture.chunks[2].toNext).toBe('');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([null, 42, { invalid: true }])(
  'drops malformed optional connectors (%j) without a retry',
  async (toNext) => {
    const payload = notePayload();
    const chunks = payload.bigPicture.chunks.map((chunk) => ({ ...chunk, toNext }));
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        geminiResponse({ ...payload, bigPicture: { ...payload.bigPicture, chunks } }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await digestNote(digestInput());
    expect(result.value.bigPicture.chunks.every((chunk) => chunk.toNext === undefined)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('rejects a first-try hint exposing the normalized answer and retries validation once', async () => {
  const good = {
    correct: false,
    feedback: '다시 떠올려 보세요.',
    missing: ['Two parts'],
    hint: '구성 요소를 세어 보세요.',
    followUp: '',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(claudeResponse({ ...good, hint: 'The answer is ＴＷＯ PARTS.' }))
    .mockResolvedValueOnce(claudeResponse(good));
  vi.stubGlobal('fetch', fetcher);
  const result = await gradeAnswer({
    question: {
      id: 'q',
      weakPointId: 'wp1',
      kind: 'explain',
      step: 1,
      prompt: 'Explain the idea.',
      answer: 'Two parts',
      evidence: noteFixture().sections[0].points[0].text,
    },
    answer: 'One',
    note: noteFixture(),
    settings,
  });
  expect(result.value).toEqual(good);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps identical reference and learner answers distinct without changing stored question data', async () => {
  const fetcher = vi.fn().mockResolvedValue(
    claudeResponse({
      correct: true,
      feedback: '핵심을 설명했어요.',
      missing: [],
      hint: '',
      followUp: '',
    }),
  );
  vi.stubGlobal('fetch', fetcher);
  const question = {
    id: 'q-equal',
    weakPointId: 'wp1',
    kind: 'explain' as const,
    prompt: 'Explain the idea.',
    answer: 'Two parts',
    evidence: noteFixture().sections[0].points[0].text,
  };
  const original = structuredClone(question);
  await gradeAnswer({ question, answer: question.answer, note: noteFixture(), settings });
  const data = JSON.parse(bodyAt(fetcher).messages[0].content[0].text);
  expect(data.learnerAnswer).toBe('Two parts');
  expect(data.referenceAnswer).toBe('Two parts');
  expect(data).not.toHaveProperty('answer');
  expect(data.question).not.toHaveProperty('answer');
  expect(data.question.prompt).toBe(question.prompt);
  expect(question).toEqual(original);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('keeps only related past weak points that exist and drops the raw field', async () => {
  const { bundles, examples } = skeletonFixture();
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      geminiResponse({ bundles, examples, relatedWeakPoints: ['Universe', 'invented point'] }),
    );
  vi.stubGlobal('fetch', fetcher);
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [],
    openWeakPoints: ['universe', 'chaining'],
    settings,
  });
  expect(result.value.weakFromCourse).toEqual(['universe']);
  expect('relatedWeakPoints' in result.value).toBe(false);
});
it('shows no past weak points when the model finds none related', async () => {
  const { bundles, examples } = skeletonFixture();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiResponse({ bundles, examples })));
  const result = await makeSkeleton({
    note: noteFixture(),
    transcript: [],
    openWeakPoints: ['universe'],
    settings,
  });
  expect(result.value.weakFromCourse).toEqual([]);
});
