import { expect, it } from 'vitest';
import {
  applyReview,
  dueWeakPoints,
  gapKind,
  lectureReviewTasks,
  nextReviewAt,
  preselectedGapIds,
  reviewProgress,
  weakPointsFromConfirmedGaps,
} from './api';
import { weakFixture } from './test-fixtures';
import type { Lecture, Reading, Recall, WeakPoint } from './types';

const local = (date: number, hour = 9, minute = 0, second = 0) =>
  new Date(2026, 9, date, hour, minute, second);
// Due dates are calendar days: local midnight `days` days after `from`, plus `offset` ms.
const elapsed = (from: Date, days: number, offset = 0) => {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() + offset);
};
const weakCreated = (createdAt = local(1, 9)): WeakPoint => ({
  ...weakFixture(),
  createdAt: createdAt.toISOString(),
  reviews: [],
});

const lectureWithRecalls = (recalls: Recall[] = []): Lecture => ({
  id: 'lecture',
  courseId: 'course',
  title: 'Synthetic lecture',
  date: local(1).toISOString(),
  transcript: [],
  materialFileIds: [],
  recalls,
});
const recallAt = (date: Date, level?: Recall['level']): Recall => ({
  id: date.toISOString(),
  date: date.toISOString(),
  level,
  photoFileIds: [],
});

it('schedules the first lecture recall at level 1 from the lecture date, inclusively', () => {
  const lecture = lectureWithRecalls();
  expect(lectureReviewTasks([lecture], elapsed(local(1), 0, -1))).toEqual([]);
  expect(lectureReviewTasks([lecture], local(1))).toEqual([
    {
      lectureId: lecture.id,
      level: 1,
      reason: '첫 복습',
      dueAt: elapsed(local(1), 0).toISOString(),
    },
  ]);
});

it.each([1, undefined] as const)(
  'schedules level 2 three days after level %s, including legacy recalls',
  (level) => {
    const last = local(2);
    const lecture = lectureWithRecalls([recallAt(last, level)]);
    expect(lectureReviewTasks([lecture], elapsed(last, 3, -1))).toEqual([]);
    expect(lectureReviewTasks([lecture], elapsed(last, 3))).toMatchObject([
      {
        lectureId: lecture.id,
        level: 2,
        dueAt: elapsed(last, 3).toISOString(),
      },
    ]);
  },
);

it('repeats level 2 fourteen days after the latest level 2 recall', () => {
  const last = local(5);
  const lecture = lectureWithRecalls([recallAt(local(1), 1), recallAt(last, 2)]);
  expect(lectureReviewTasks([lecture], elapsed(last, 14, -1))).toEqual([]);
  expect(lectureReviewTasks([lecture], elapsed(last, 14))).toMatchObject([
    {
      level: 2,
      dueAt: elapsed(last, 14).toISOString(),
    },
  ]);
  lecture.recalls.push(recallAt(elapsed(last, 14), 2));
  expect(lectureReviewTasks([lecture], elapsed(last, 28, -1))).toEqual([]);
  expect(lectureReviewTasks([lecture], elapsed(last, 28))).toHaveLength(1);
});

it('never schedules level 3 or an automatic follow-up after manual level 3', () => {
  const lecture = lectureWithRecalls([recallAt(local(1), 1), recallAt(local(5), 3)]);
  expect(lectureReviewTasks([lecture], elapsed(local(5), 100))).toEqual([]);
});

it('uses chronological latest recalls, returns overdue tasks by due date and leaves inputs untouched', () => {
  const lecture = lectureWithRecalls([recallAt(local(5), 2), recallAt(local(2), 1)]);
  const older = { ...lectureWithRecalls(), id: 'older' };
  const input = [lecture, older];
  const snapshot = structuredClone(input);
  expect(lectureReviewTasks(input, local(30)).map((task) => task.lectureId)).toEqual([
    'older',
    'lecture',
  ]);
  expect(input).toEqual(snapshot);
});

it('does not schedule future lectures, future recall follow-ups or invalid dates', () => {
  const invalid = { ...lectureWithRecalls(), date: 'invalid' };
  expect(lectureReviewTasks([invalid], local(30))).toEqual([]);
  expect(lectureReviewTasks([lectureWithRecalls()], local(0))).toEqual([]);
  expect(lectureReviewTasks([lectureWithRecalls([recallAt(local(30), 2)])], local(5))).toEqual([]);
  expect(lectureReviewTasks([lectureWithRecalls()], new Date(NaN))).toEqual([]);
});

it('is first due after one elapsed day', () => {
  const created = local(1, 9);
  const wp = weakCreated(created);
  expect(dueWeakPoints([wp], elapsed(created, 1, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(created, 1))).toEqual([wp]);
});

it('uses one, three and seven day intervals, with a wrong answer restarting at one day', () => {
  let wp = weakCreated();
  const first = local(2, 9);
  wp = applyReview(wp, true, first, 'q1', { step: 1 });
  expect(dueWeakPoints([wp], elapsed(first, 3, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(first, 3))).toEqual([wp]);

  const second = elapsed(first, 3);
  wp = applyReview(wp, true, second, 'q2', { step: 1 });
  expect(wp.resolvedAt).toBeUndefined();
  expect(dueWeakPoints([wp], elapsed(second, 7, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(second, 7))).toEqual([wp]);

  const wrong = elapsed(second, 7);
  wp = applyReview(wp, false, wrong, 'q3', { step: 2 });
  expect(dueWeakPoints([wp], elapsed(wrong, 1, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(wrong, 1))).toEqual([wp]);
});

it('stores same-created-day reviews as quick and excludes legacy same-day reviews too', () => {
  const created = local(1, 8);
  const original = weakCreated(created);
  const quickAt = local(1, 23, 59);
  const quick = applyReview(original, true, quickAt, 'quick', { step: 2 });

  expect(quick.reviews[0]).toMatchObject({ correct: true, step: 2, quick: true });
  expect(quick.resolvedAt).toBeUndefined();
  expect(reviewProgress(quick)).toEqual({ step: 1, correctDays: 0 });
  expect(dueWeakPoints([quick], elapsed(created, 1))).toEqual([quick]);

  const legacy: WeakPoint = {
    ...weakCreated(created),
    reviews: [{ date: local(1, 12).toISOString(), correct: true, step: 2 }],
  };
  expect(reviewProgress(legacy)).toEqual({ step: 1, correctDays: 0 });
  expect(dueWeakPoints([legacy], elapsed(created, 1))).toEqual([legacy]);

  const nextDay = applyReview(legacy, true, local(2, 12), 'next', { step: 2 });
  expect(nextDay.resolvedAt).toBeUndefined();
});

it('requires a later step-2 success on a distinct local day and does not mutate input', () => {
  const original = weakCreated();
  const late = local(2, 23, 59);
  const sameLocalDay = local(2, 23, 59, 30);
  const nextLocalDay = local(3, 0, 1);

  let wp = applyReview(original, true, late, 'q1', { step: 1 });
  wp = applyReview(wp, true, sameLocalDay, 'q2', { step: 2 });
  expect(wp.resolvedAt).toBeUndefined();
  wp = applyReview(wp, true, nextLocalDay, 'q3', { step: 2 });

  expect(wp.resolvedAt).toBe(nextLocalDay.toISOString());
  expect(original.reviews).toEqual([]);
  expect(wp.reviews[0].questionId).toBe('q1');
});

it('treats missing step metadata and applyReview defaults as step 1, never resolution proof', () => {
  let wp = weakCreated();
  wp = applyReview(wp, true, local(2), 'default-one');
  wp = applyReview(wp, true, local(3), 'also-default-one');
  expect(wp.reviews.map((review) => review.step)).toEqual([1, 1]);
  expect(wp.resolvedAt).toBeUndefined();

  const imported: WeakPoint = {
    ...weakCreated(),
    reviews: [
      { date: local(2).toISOString(), correct: true },
      { date: local(3).toISOString(), correct: true },
    ],
  };
  expect(reviewProgress(imported)).toEqual({ step: 2, correctDays: 1 });
  expect(imported.resolvedAt).toBeUndefined();

  const laterStepTwo = applyReview(imported, true, local(4), 'step-two', { step: 2 });
  expect(laterStepTwo.resolvedAt).toBe(local(4).toISOString());
});

it('records hinted correctness without advancing the ladder, interval streak or resolution', () => {
  let wp = weakCreated();
  const first = local(2);
  wp = applyReview(wp, true, first, 'q1', { step: 1 });
  const hinted = elapsed(first, 3);
  wp = applyReview(wp, true, hinted, 'q2', { step: 2, hinted: true });

  expect(wp.reviews.at(-1)).toMatchObject({ correct: true, step: 2, hinted: true });
  expect(wp.resolvedAt).toBeUndefined();
  expect(reviewProgress(wp)).toEqual({ step: 2, correctDays: 1 });
  expect(dueWeakPoints([wp], elapsed(hinted, 3, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(hinted, 3))).toEqual([wp]);

  wp = applyReview(wp, true, elapsed(hinted, 3), 'q3', { step: 2 });
  expect(wp.resolvedAt).toBe(elapsed(hinted, 3).toISOString());
});

it('keeps an earlier independent correct day across an ordinary wrong answer', () => {
  let wp = weakCreated();
  wp = applyReview(wp, true, local(2), 'q1', { step: 1 });
  const wrong = local(5);
  wp = applyReview(wp, false, wrong, 'q2', { step: 2 });

  expect(wp.resolvedAt).toBeUndefined();
  expect(dueWeakPoints([wp], elapsed(wrong, 1))).toEqual([wp]);

  const laterCorrect = elapsed(wrong, 1);
  wp = applyReview(wp, true, laterCorrect, 'q3', { step: 2 });
  expect(wp.resolvedAt).toBe(laterCorrect.toISOString());
});

it('retains after 21 days only with an unaided step-2 answer', () => {
  let wp = weakCreated();
  wp = applyReview(wp, true, local(2), 'q1', { step: 1 });
  wp = applyReview(wp, true, local(5), 'q2', { step: 2 });
  const resolvedAt = local(5);

  expect(dueWeakPoints([wp], elapsed(resolvedAt, 21, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(resolvedAt, 21))).toEqual([wp]);

  wp = applyReview(wp, true, elapsed(resolvedAt, 21), 'hinted-retention', {
    step: 2,
    hinted: true,
  });
  expect(wp.retainedAt).toBeUndefined();
  expect(wp.reviews.at(-1)?.retention).toBe(true);

  wp = applyReview(wp, true, elapsed(resolvedAt, 22), 'step-one-retention', { step: 1 });
  expect(wp.retainedAt).toBeUndefined();

  const retainedAt = elapsed(resolvedAt, 23);
  wp = applyReview(wp, true, retainedAt, 'step-two-retention', { step: 2 });
  expect(wp.retainedAt).toBe(retainedAt.toISOString());
  expect(dueWeakPoints([wp], elapsed(resolvedAt, 100))).toEqual([]);
});

it('starts a fresh two-day cycle after failed retention', () => {
  let wp = weakCreated();
  wp = applyReview(wp, true, local(2), 'q1', { step: 1 });
  wp = applyReview(wp, true, local(5), 'q2', { step: 2 });
  const beforeFailure = wp;

  wp = applyReview(wp, false, local(26), 'failed-retention', { step: 2 });
  expect(wp.resolvedAt).toBeUndefined();
  expect(wp.retainedAt).toBeUndefined();
  expect(wp.reviews.slice(0, 2)).toEqual(beforeFailure.reviews);
  expect(wp.reviews.at(-1)?.retention).toBe(true);

  const freshFirst = local(27, 23, 59);
  wp = applyReview(wp, true, freshFirst, 'fresh-one', { step: 2 });
  expect(wp.resolvedAt).toBeUndefined();
  wp = applyReview(wp, true, local(27, 23, 59, 30), 'same-day', { step: 2 });
  expect(wp.resolvedAt).toBeUndefined();

  const freshSecondDay = local(28, 0, 1);
  wp = applyReview(wp, true, freshSecondDay, 'fresh-two', { step: 2 });
  expect(wp.resolvedAt).toBe(freshSecondDay.toISOString());
});

it('sorts imported reviews chronologically without mutating their order', () => {
  const wp = weakCreated();
  wp.reviews = [
    { date: local(10).toISOString(), correct: false, step: 2 },
    { date: local(2).toISOString(), correct: true, step: 1 },
  ];
  expect(dueWeakPoints([wp], elapsed(local(10), 1, -1))).toEqual([]);
  expect(dueWeakPoints([wp], elapsed(local(10), 1))).toEqual([wp]);
  expect(wp.reviews[0].date).toBe(local(10).toISOString());
});

it('defaults legacy gap kinds to concept and copies confirmed kinds into weak points', () => {
  const createdAt = local(1);
  const reading: Reading = {
    recalled: [],
    corrected: [],
    gaps: [
      { id: 'legacy', concept: 'Legacy', why: 'Missing', uncertain: true },
      {
        id: 'corrected',
        concept: 'Corrected',
        why: 'Fixed in red',
        kind: 'corrected',
        noteSection: 'Details',
      },
      { id: 'ignored', concept: 'Ignored', why: 'Not confirmed', kind: 'section' },
    ],
    model: 'test',
    promptVersion: 'reading-v3',
    createdAt: createdAt.toISOString(),
  };
  const lecture: Lecture = {
    id: 'l1',
    courseId: 'c1',
    title: 'Test',
    date: createdAt.toISOString(),
    transcript: [],
    materialFileIds: [],
    recalls: [],
  };

  expect(gapKind()).toBe('concept');
  expect(gapKind('section')).toBe('section');
  const result = weakPointsFromConfirmedGaps(
    { id: 'c1', name: 'Course', createdAt: createdAt.toISOString() },
    lecture,
    reading,
    ['legacy', 'corrected', 'legacy', 'unknown'],
    createdAt,
  );
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ concept: 'Legacy', gapKind: 'concept', reviews: [] });
  expect(result[1]).toMatchObject({
    concept: 'Corrected',
    gapKind: 'corrected',
    noteSection: 'Details',
  });
});

it('preselects paper uncertainty marks but asked gaps only when paper has the same concept', () => {
  expect(
    preselectedGapIds([
      {
        id: 'paper-self-flagged',
        concept: 'Beta',
        why: 'Marked unclear',
        kind: 'self-flagged',
        source: 'paper',
        uncertain: true,
      },
      {
        id: 'paper-uncertain',
        concept: 'Gamma',
        why: 'Uncertain reading',
        kind: 'concept',
        source: 'paper',
        uncertain: true,
      },
      {
        id: 'paper-certain',
        concept: 'Delta',
        why: 'Missing',
        kind: 'concept',
        source: 'paper',
      },
      {
        id: 'asked-only',
        concept: 'Question only',
        why: 'Asked before recall',
        kind: 'self-flagged',
        source: 'asked',
      },
      {
        id: 'paper-duplicate',
        concept: 'Alpha!',
        why: 'Paper match',
        source: 'paper',
        uncertain: true,
      },
      {
        id: 'asked-duplicate',
        concept: '  alpha  ',
        why: 'Asked before recall',
        source: 'asked',
        uncertain: true,
      },
    ]),
  ).toEqual(['paper-self-flagged', 'paper-certain', 'asked-duplicate']);
});

it('keeps the first step after a wrong-then-hinted success', () => {
  let wp = weakCreated();
  wp = applyReview(wp, false, local(2), 'q1', { step: 1 });
  wp = applyReview(wp, true, local(2, 9, 1), 'q1', { step: 1, hinted: true });
  expect(wp.reviews.at(-1)?.correct).toBe(true);
  expect(reviewProgress(wp)).toEqual({ step: 1, correctDays: 0 });
  expect(wp.resolvedAt).toBeUndefined();
  expect(dueWeakPoints([wp], elapsed(local(2, 9, 1), 1))).toEqual([wp]);
});

it('does not consume the 21-day retention check during early voluntary practice', () => {
  let wp = weakCreated();
  wp = applyReview(wp, true, local(2), 'q1', { step: 1 });
  wp = applyReview(wp, true, local(5), 'q2', { step: 2 });
  wp = applyReview(wp, true, local(5, 10), 'early-correct', { step: 2 });
  wp = applyReview(wp, false, local(6), 'early-wrong', { step: 2 });
  expect(wp.retainedAt).toBeUndefined();
  expect(wp.resolvedAt).toBe(local(5).toISOString());
  expect(wp.reviews.at(-1)?.retention).toBeUndefined();
  expect(dueWeakPoints([wp], local(26))).toEqual([wp]);
});

it('merges selected paper and asked duplicates, preserving the paper diagnosis', () => {
  const createdAt = local(1).toISOString();
  const reading: Reading = {
    recalled: [],
    corrected: [],
    model: 'test',
    promptVersion: 'reading-v3',
    createdAt,
    gaps: [
      { id: 'asked', concept: 'TOPIC', why: 'Asked', source: 'asked', kind: 'concept' },
      {
        id: 'paper',
        concept: 'Topic',
        why: 'Marked unclear',
        source: 'paper',
        kind: 'self-flagged',
      },
    ],
  };
  const lecture: Lecture = {
    id: 'l1',
    courseId: 'c1',
    title: 'Test',
    date: createdAt,
    transcript: [],
    materialFileIds: [],
    recalls: [],
  };
  const result = weakPointsFromConfirmedGaps(
    { id: 'c1', name: 'Course', createdAt },
    lecture,
    reading,
    ['asked', 'paper'],
    local(1),
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    concept: 'Topic',
    detail: 'Marked unclear',
    gapKind: 'self-flagged',
  });
});

it('nextReviewAt agrees with dueWeakPoints and ignores same-day practice', () => {
  const created = local(1, 9);
  let wp = weakCreated(created);
  expect(nextReviewAt(wp)?.getTime()).toBe(elapsed(created, 1).getTime());
  wp = applyReview(wp, true, local(1, 15), 'q', { step: 1 });
  expect(nextReviewAt(wp)?.getTime()).toBe(elapsed(created, 1).getTime());
  expect(reviewProgress(wp).correctDays).toBe(0);
  const next = nextReviewAt(wp)!;
  expect(dueWeakPoints([wp], new Date(next.getTime() - 1))).toEqual([]);
  expect(dueWeakPoints([wp], next)).toEqual([wp]);
  const resolved = { ...wp, resolvedAt: local(10).toISOString() };
  expect(nextReviewAt(resolved)?.getTime()).toBe(elapsed(local(10), 21).getTime());
  expect(nextReviewAt({ ...resolved, retainedAt: local(31).toISOString() })).toBeUndefined();
});

it('counts two correct answers on one day as one step of the interval ladder', () => {
  let wp = weakCreated();
  const first = local(2, 9);
  wp = applyReview(wp, true, first, 'q1', { step: 1 });
  wp = applyReview(wp, true, local(2, 15), 'q2', { step: 2 });
  expect(wp.resolvedAt).toBeUndefined();
  expect(nextReviewAt(wp)).toEqual(elapsed(first, 3));
});
