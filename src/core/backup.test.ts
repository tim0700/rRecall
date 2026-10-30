import { expect, it } from 'vitest';
import { decodeBundle, encodeBundle } from './api';
import { now, noteFixture, skeletonFixture, weakFixture } from './test-fixtures';
const empty = () => ({ courses: [], lectures: [], weakPoints: [], questions: [], chats: [] });
it('round-trips binary files and Unicode with metadata', async () => {
  const blob = new Blob([new Uint8Array([0, 128, 255]), '한글'], {
    type: 'application/octet-stream',
  });
  const bundle = await encodeBundle(
    { ...empty(), attribution: '제작자', simulatedDates: true },
    [{ id: 'f', name: '테스트.bin', mime: blob.type, size: blob.size, blob, createdAt: now }],
    new Date(now),
  );
  const result = decodeBundle(JSON.stringify(bundle));
  expect(result.bundle.attribution).toBe('제작자');
  expect(new Uint8Array(await result.files[0].blob.arrayBuffer())).toEqual(
    new Uint8Array(await blob.arrayBuffer()),
  );
  expect(result.files[0].name).toBe('테스트.bin');
});
it('round-trips notes, skeletons and optional undefined fields', async () => {
  const bundle = await encodeBundle(
    {
      ...empty(),
      lectures: [
        {
          id: 'l',
          courseId: 'c',
          title: 'Lecture',
          date: now,
          transcript: [{ text: 'hello', t: undefined }],
          materialFileIds: [],
          recalls: [],
          note: noteFixture(),
          skeleton: skeletonFixture(),
        },
      ],
    },
    [],
    new Date(now),
  );
  expect(decodeBundle(bundle).bundle.lectures[0].note).toEqual(noteFixture());
});
it('round-trips all round-two optional fields and still accepts a legacy bundle', async () => {
  const note = noteFixture();
  note.bigPicture.chunks[0].toNext = 'A remaining problem leads to the next idea.';
  note.bigPicture.chunks.at(-1)!.toNext = '';
  note.sections[0].points[0].fromHandwriting = true;
  const bundle = await encodeBundle(
    {
      ...empty(),
      courses: [{ id: 'c', name: 'Course', description: '내 과목 설명', createdAt: now }],
      lectures: [
        {
          id: 'l',
          courseId: 'c',
          title: 'Lecture',
          date: now,
          transcript: [],
          materialFileIds: [],
          note,
          skeleton: skeletonFixture(),
          recalls: [
            { id: 'r', date: now, level: 2, photoFileIds: ['image'], typedText: 'Definition' },
          ],
        },
      ],
      weakPoints: [{ ...weakFixture(), resolvedAt: now, retainedAt: now }],
      chats: [
        {
          id: 't',
          courseId: 'c',
          lectureId: 'l',
          purpose: 'before-recall',
          title: '첫 질문',
          createdAt: now,
          messages: [
            { role: 'user', text: '사진 질문', at: now, imageFileIds: ['image'] },
            { role: 'assistant', text: '답', at: now, estimatedCredits: 0.25 },
          ],
        },
      ],
    },
    [],
    new Date(now),
  );
  expect(decodeBundle(JSON.stringify(bundle)).bundle).toEqual(bundle);
  const legacy = structuredClone(bundle);
  legacy.lectures[0].note!.bigPicture.chunks.forEach((chunk) => {
    delete chunk.toNext;
  });
  delete legacy.courses[0].description;
  delete legacy.lectures[0].note!.sections[0].chunk;
  delete legacy.lectures[0].note!.sections[0].points[0].fromHandwriting;
  delete legacy.lectures[0].skeleton!.bundles[0].chunk;
  delete legacy.lectures[0].skeleton!.bundles[0].definitions;
  delete legacy.lectures[0].recalls[0].level;
  delete legacy.weakPoints[0].retainedAt;
  delete legacy.chats[0].title;
  delete legacy.chats[0].createdAt;
  delete legacy.chats[0].messages[0].imageFileIds;
  delete legacy.chats[0].messages[1].estimatedCredits;
  expect(decodeBundle(JSON.stringify(legacy)).bundle).toEqual(legacy);
  for (const level of [0, 4, 1.5, '2']) {
    const invalid = JSON.parse(JSON.stringify(bundle));
    invalid.lectures[0].recalls[0].level = level;
    expect(() => decodeBundle(invalid)).toThrow();
  }
});
it('round-trips redesigned review fields and accepts the legacy tutor shapes', async () => {
  const bundle = await encodeBundle(
    {
      ...empty(),
      lectures: [
        {
          id: 'l1',
          courseId: 'c1',
          title: 'Synthetic lecture',
          date: now,
          transcript: [],
          materialFileIds: [],
          recalls: [
            {
              id: 'r1',
              date: now,
              photoFileIds: [],
              reading: {
                recalled: [],
                corrected: [],
                gaps: [
                  {
                    id: 'g1',
                    concept: 'Synthetic concept',
                    why: 'The learner marked this as unclear.',
                    kind: 'self-flagged',
                    source: 'asked',
                    noteSection: 'Topic',
                  },
                ],
                model: 'test-model',
                promptVersion: 'reading-v3',
                createdAt: now,
              },
            },
          ],
        },
      ],
      weakPoints: [
        {
          ...weakFixture(),
          gapKind: 'self-flagged',
          noteSection: 'Topic',
          reviews: [
            {
              date: now,
              correct: true,
              questionId: 'q1',
              step: 2,
              hinted: false,
              retention: false,
              quick: false,
            },
          ],
        },
      ],
      questions: [
        {
          id: 'q1',
          weakPointId: 'wp1',
          kind: 'connect',
          step: 2,
          prompt: 'How does this idea connect to its neighbour?',
          answer: 'It shares a synthetic boundary.',
          evidence: 'Synthetic evidence.',
        },
      ],
      attempts: [
        {
          id: 'a1',
          questionId: 'q1',
          weakPointId: 'wp1',
          answer: 'First answer',
          grade: {
            correct: false,
            feedback: 'One link is still missing.',
            missing: ['the shared boundary'],
            hint: 'Look for what both ideas depend on.',
          },
          at: now,
          attemptNumber: 1,
          hinted: true,
          gaveUp: false,
          quick: true,
        },
        {
          id: 'a2',
          questionId: 'q1',
          weakPointId: 'wp1',
          answer: 'Second answer',
          grade: {
            correct: true,
            feedback: 'You named the shared boundary.',
            missing: [],
            followUp: 'What changes if that boundary moves?',
          },
          at: '2026-10-02T12:00:00.000Z',
          attemptNumber: 2,
          hinted: true,
          gaveUp: false,
          quick: false,
        },
      ],
    },
    [],
    new Date(now),
  );

  expect(decodeBundle(JSON.stringify(bundle)).bundle).toEqual(bundle);

  const legacy = JSON.parse(JSON.stringify(bundle));
  delete legacy.lectures[0].recalls[0].reading.gaps[0].kind;
  delete legacy.lectures[0].recalls[0].reading.gaps[0].source;
  delete legacy.weakPoints[0].gapKind;
  delete legacy.weakPoints[0].noteSection;
  delete legacy.weakPoints[0].reviews[0].step;
  delete legacy.weakPoints[0].reviews[0].hinted;
  delete legacy.weakPoints[0].reviews[0].retention;
  delete legacy.weakPoints[0].reviews[0].quick;
  legacy.questions[0].kind = 'short';
  delete legacy.questions[0].step;
  for (const attempt of legacy.attempts) {
    delete attempt.grade.hint;
    delete attempt.grade.followUp;
    delete attempt.attemptNumber;
    delete attempt.hinted;
    delete attempt.gaveUp;
    delete attempt.quick;
  }
  expect(decodeBundle(legacy).bundle).toEqual(legacy);

  const legacyBlank = structuredClone(legacy);
  legacyBlank.questions[0].kind = 'blank';
  expect(decodeBundle(legacyBlank).bundle.questions[0].kind).toBe('blank');
});
it('rejects unknown gap and question kinds in nested backup records', async () => {
  const bundle = await encodeBundle(
    {
      ...empty(),
      lectures: [
        {
          id: 'l1',
          courseId: 'c1',
          title: 'Synthetic lecture',
          date: now,
          transcript: [],
          materialFileIds: [],
          recalls: [
            {
              id: 'r1',
              date: now,
              photoFileIds: [],
              reading: {
                recalled: [],
                corrected: [],
                gaps: [{ id: 'g1', concept: 'Concept', why: 'Missing', kind: 'concept' }],
                model: 'test-model',
                promptVersion: 'reading-v3',
                createdAt: now,
              },
            },
          ],
        },
      ],
      weakPoints: [{ ...weakFixture(), gapKind: 'concept' }],
      questions: [
        {
          id: 'q1',
          weakPointId: 'wp1',
          kind: 'explain',
          step: 1,
          prompt: 'Explain the concept.',
          answer: 'Synthetic answer',
          evidence: 'Synthetic evidence',
        },
      ],
    },
    [],
    new Date(now),
  );
  const badGap = JSON.parse(JSON.stringify(bundle));
  badGap.lectures[0].recalls[0].reading.gaps[0].kind = 'unknown';
  expect(() => decodeBundle(badGap)).toThrow();
  const badWeakPoint = JSON.parse(JSON.stringify(bundle));
  badWeakPoint.weakPoints[0].gapKind = 'unknown';
  expect(() => decodeBundle(badWeakPoint)).toThrow();
  const badQuestion = JSON.parse(JSON.stringify(bundle));
  badQuestion.questions[0].kind = 'multiple-choice';
  expect(() => decodeBundle(badQuestion)).toThrow();
  const badSource = JSON.parse(JSON.stringify(bundle));
  badSource.lectures[0].recalls[0].reading.gaps[0].source = 'chat';
  expect(() => decodeBundle(badSource)).toThrow();
});
it('rejects unknown formats/versions and malformed nested records', async () => {
  const bundle = await encodeBundle(empty(), [], new Date(now));
  for (const invalid of [
    { ...bundle, version: 2 },
    { ...bundle, format: 'other' },
    { ...bundle, lectures: [{}] },
    null,
    'not json',
  ]) {
    expect(() => decodeBundle(invalid)).toThrow();
  }
});
it('rejects invalid base64, inconsistent size and duplicate file IDs', async () => {
  const blob = new Blob(['x']);
  const bundle = await encodeBundle(
    empty(),
    [{ id: 'f', name: 'x', mime: 'text/plain', size: 1, blob, createdAt: now }],
    new Date(now),
  );
  expect(() =>
    decodeBundle({ ...bundle, files: [{ ...bundle.files[0], base64: '**' }] }),
  ).toThrow();
  expect(() => decodeBundle({ ...bundle, files: [{ ...bundle.files[0], size: 2 }] })).toThrow();
  expect(() => decodeBundle({ ...bundle, files: [bundle.files[0], bundle.files[0]] })).toThrow();
});

it('round-trips attempts and accepts older bundles without them', async () => {
  const attempts = [
    {
      id: 'a',
      questionId: 'q',
      weakPointId: 'w',
      answer: '내 답',
      grade: { correct: false, feedback: '다시 생각해 봐요.', missing: ['이유'] },
      at: now,
    },
  ];
  const bundle = await encodeBundle({ ...empty(), attempts }, [], new Date(now));
  expect(decodeBundle(JSON.stringify(bundle)).bundle.attempts).toEqual(attempts);
  expect(() =>
    decodeBundle({ ...bundle, attempts: [{ ...attempts[0], grade: { correct: 'yes' } }] }),
  ).toThrow();
  delete bundle.attempts;
  expect(decodeBundle(bundle).bundle.attempts).toBeUndefined();
});
