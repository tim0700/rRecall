import { expect, it } from 'vitest';
import { recallCalibration } from './api';
import type { Lecture, Reading, Recall, WeakPoint } from './types';
import { weakFixture } from './test-fixtures';

const at = (day: number) => new Date(2026, 9, day, 9).toISOString();
const reading = (changes: Partial<Reading> = {}): Reading => ({
  recalled: [],
  corrected: [],
  gaps: [],
  model: 'test',
  promptVersion: 'test',
  createdAt: at(1),
  ...changes,
});
const recall = (day: number, value: Reading): Recall => ({
  id: String(day),
  date: at(day),
  photoFileIds: [],
  reading: value,
});
const lecture = (recalls: Recall[]): Lecture => ({
  id: 'l1',
  courseId: 'c1',
  title: 'Synthetic',
  date: at(1),
  transcript: [],
  materialFileIds: [],
  recalls,
});
const point = (reviews: WeakPoint['reviews'], changes: Partial<WeakPoint> = {}): WeakPoint => ({
  ...weakFixture(),
  concept: 'Idea',
  createdAt: at(1),
  gapKind: 'self-flagged',
  reviews,
  ...changes,
});

it('shows a self-flagged point only when the first counted try is correct without a hint', () => {
  const wp = point([
    { date: at(3), correct: true },
    { date: at(1), correct: false },
    { date: at(2), correct: false, quick: true },
  ]);
  expect(recallCalibration(lecture([]), [wp]).underestimated).toEqual(['Idea']);
  expect(wp.reviews[0].date).toBe(at(3));
});

it.each([
  {
    reviews: [
      { date: at(2), correct: false },
      { date: at(3), correct: true },
    ],
  },
  { reviews: [{ date: at(2), correct: true, hinted: true }] },
  { reviews: [{ date: at(1), correct: true }] },
])(
  'does not treat later success, hints or quick checks as a first-try success: %j',
  ({ reviews }) => {
    expect(recallCalibration(lecture([]), [point(reviews)]).underestimated).toEqual([]);
  },
);

it('matches earlier black recall to later gaps or counted wrong reviews within the same lecture', () => {
  const earlier = recall(1, reading({ recalled: [{ text: 'Own words', concept: 'IDEA!' }] }));
  const later = recall(3, reading({ gaps: [{ id: 'g', concept: 'Idea', why: 'Missing' }] }));
  expect(recallCalibration(lecture([later, earlier]), []).overestimated).toEqual(['Idea']);
  expect(
    recallCalibration(lecture([earlier]), [point([{ date: at(2), correct: false }])]).overestimated,
  ).toEqual(['Idea']);
  expect(
    recallCalibration(lecture([earlier]), [
      point([{ date: at(2), correct: false }], { lectureId: 'foreign' }),
    ]).overestimated,
  ).toEqual([]);
});

it('does not infer prior knowledge from red corrections, uncertain readings or simultaneous self-flags', () => {
  const gap = { id: 'g', concept: 'Idea', why: 'Unsure', kind: 'self-flagged' as const };
  const later = recall(3, reading({ gaps: [gap] }));
  for (const earlier of [
    reading({ corrected: [{ text: 'Idea' }] }),
    reading({ recalled: [{ text: 'Idea', uncertain: true }] }),
    reading({ recalled: [{ text: 'Idea' }], gaps: [gap] }),
  ]) {
    expect(recallCalibration(lecture([recall(1, earlier), later]), []).overestimated).toEqual([]);
  }
});

it('ignores questions alone, rejected gaps, same-time events and unsupported paraphrase matches', () => {
  const earlier = recall(1, reading({ recalled: [{ text: 'Idea' }] }));
  const later = recall(
    3,
    reading({
      gaps: [
        { id: 'asked', concept: 'Idea', why: 'Asked', source: 'asked' },
        { id: 'uncertain', concept: 'Idea', why: 'Unclear image', uncertain: true },
        { id: 'different', concept: 'Related idea', why: 'Missing' },
      ],
    }),
  );
  expect(recallCalibration(lecture([earlier, later]), []).overestimated).toEqual([]);
  const rejected = {
    ...recall(3, reading({ gaps: [{ id: 'no', concept: 'Idea', why: 'Missing' }] })),
    confirmedGapIds: [],
  };
  expect(recallCalibration(lecture([earlier, rejected]), []).overestimated).toEqual([]);
  expect(
    recallCalibration(lecture([earlier]), [
      point([{ date: at(1), correct: false }], { createdAt: at(0) }),
    ]).overestimated,
  ).toEqual([]);
});
