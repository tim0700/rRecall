import { expect, it } from 'vitest';
import {
  findLeaks,
  wordBankWarnings,
  normalize,
  quoteExists,
  verifiedQuestions,
  verifyNote,
  validNoteChunks,
  filterDefinitions,
} from './checks';
import { noteFixture, skeletonFixture } from './test-fixtures';

it('accepts only exact big-picture chunk titles for every generated note section', () => {
  const note = noteFixture();
  expect(validNoteChunks(note)).toBe(true);
  note.sections[0].chunk = 'Invented';
  expect(validNoteChunks(note)).toBe(false);
  note.sections[0].chunk = 'middle';
  expect(validNoteChunks(note)).toBe(false);
  delete note.sections[0].chunk;
  expect(validNoteChunks(note)).toBe(false);
});
it('drops definitions outside the exact word bank without mutating input or flagging hidden answers', () => {
  const skeleton = skeletonFixture();
  const bundle = skeleton.bundles[0];
  bundle.definitions!.push({ term: 'Other', definition: 'Not requested' });
  bundle.definitions!.push({ term: 'Concept', definition: 'Different spelling' });
  const checked = filterDefinitions(bundle);
  expect(checked.definitions).toEqual([bundle.definitions![0]]);
  expect(bundle.definitions).toHaveLength(3);
  expect(findLeaks({ ...skeleton, bundles: [checked] })).toEqual([]);
});

it('normalizes compatibility forms, punctuation, case and whitespace', () => {
  expect(normalize('  ＡＢＣ, “개념”\n  테스트! ')).toBe('abc 개념 테스트');
});
it('checks normalized quotes while rejecting empty normalized quotes', () => {
  expect(quoteExists('ＡＢＣ, 개념', 'The abc 개념 is here.')).toBe(true);
  expect(quoteExists('""', 'anything')).toBe(false);
  expect(quoteExists('missing', 'anything')).toBe(false);
});
it('sets verified if any evidence exists and replaces model supplied verification', () => {
  const note = noteFixture();
  note.sections[0].points = [
    { text: 'a', evidence: ['missing', 'exact quote'], verified: false },
    { text: 'b', evidence: [], verified: true },
  ];
  expect(
    verifyNote(note, [{ text: 'An EXACT quote.' }]).sections[0].points.map((p) => p.verified),
  ).toEqual([true, false]);
  expect(note.sections[0].points[0].verified).toBe(false);
});
it('finds answer leaks in every title, blank sentence and example; ignores word bank', () => {
  const skeleton = skeletonFixture();
  expect(findLeaks(skeleton)).toEqual([]);
  skeleton.bundles[0].title = 'CONCEPT';
  skeleton.bundles[0].blanks.push({ sentence: 'concept ___', answer: 'z' });
  skeleton.examples = ['A concept appears here.'];
  expect(findLeaks(skeleton)).toHaveLength(3);
});
it('drops question evidence outside note sections and points', () => {
  const note = noteFixture();
  const base = {
    id: 'q',
    weakPointId: 'w',
    kind: 'short' as const,
    prompt: 'Question',
    answer: 'Answer',
  };
  expect(
    verifiedQuestions(
      [
        { ...base, evidence: note.sections[0].points[0].evidence[0] },
        { ...base, evidence: note.bigPicture.question },
        { ...base, evidence: '' },
      ],
      note,
    ),
  ).toHaveLength(1);
});

it('finds unused word-bank labels across bundles with normalized spelling', () => {
  const skeleton = skeletonFixture();
  skeleton.bundles[0].wordBank.push('Extra-Term', 'x');
  skeleton.bundles.push({
    title: 'ＥＸＴＲＡ－ＴＥＲＭ',
    wordBank: [],
    blanks: [{ sentence: 'extra-term ___', answer: '숨김' }],
  });
  skeleton.examples = ['Extra-Term', 'x'];
  expect(findLeaks(skeleton).map((leak) => leak.location)).toEqual([
    '묶음 2 제목',
    '묶음 2 빈칸 1',
    '예제 1',
  ]);
});
it('detects even one-character answers and warns on exact bank membership', () => {
  const skeleton = skeletonFixture();
  skeleton.bundles[0].blanks = [{ sentence: '값 ___ (값)', answer: '값' }];
  expect(findLeaks(skeleton)).toHaveLength(1);
  expect(wordBankWarnings(skeleton)).toEqual([
    '묶음 1 빈칸 1의 정답이 단어 모음에 없어요. 복습 전에 확인해 주세요.',
  ]);
  skeleton.bundles[0].wordBank = ['값'];
  expect(wordBankWarnings(skeleton)).toEqual([]);
  skeleton.bundles[0].blanks[0].answer = 'Concept';
  skeleton.bundles[0].wordBank = ['concept'];
  expect(wordBankWarnings(skeleton)).toHaveLength(1);
});

it('rejects normalized answer leaks, empty answers and repeated questions', () => {
  const note = noteFixture();
  const q = {
    id: 'q',
    weakPointId: 'w',
    kind: 'explain' as const,
    step: 1 as const,
    prompt: 'Describe the two pieces in your own words.',
    answer: 'Two parts',
    evidence: note.sections[0].points[0].text,
  };
  expect(verifiedQuestions([q], note)).toEqual([q]);
  expect(
    verifiedQuestions(
      [
        { ...q, prompt: 'Explain ＴＷＯ,   PARTS!' },
        { ...q, answer: '""' },
      ],
      note,
    ),
  ).toEqual([]);
  expect(
    verifiedQuestions([q, { ...q, id: 'duplicate', prompt: q.prompt.toUpperCase() }], note),
  ).toEqual([q]);
  expect(
    verifiedQuestions([q], note, [{ ...q, id: 'previous', prompt: q.prompt.toUpperCase() }]),
  ).toEqual([]);
  expect(verifiedQuestions([q], note, [{ ...q, weakPointId: 'another' }])).toEqual([q]);
});
