import type {
  Course,
  GapKind,
  Lecture,
  LectureReviewTask,
  Reading,
  ReadingGap,
  WeakPoint,
} from './types';
import { normalize } from './checks';
export function newId(): string {
  return crypto.randomUUID();
}
const localDay = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
/** Local midnight `days` calendar days after `from`: "3 days later" means that whole day, not 72 hours. */
const dayStart = (from: number, days: number): number => {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

/** Due tasks only. Legacy recalls are level 1; manual level 3 has no automatic follow-up. */
export function lectureReviewTasks(lectures: Lecture[], now: Date): LectureReviewTask[] {
  return lectures
    .flatMap((lecture): LectureReviewTask[] => {
      const last = [...lecture.recalls]
        .filter((recall) => Number.isFinite(Date.parse(recall.date)))
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
      if (last?.level === 3) return [];
      const interval = last ? ((last.level ?? 1) === 1 ? 3 : 14) : 0;
      const due = dayStart(Date.parse(last?.date ?? lecture.date), interval);
      if (!Number.isFinite(due) || due > now.getTime() || !Number.isFinite(now.getTime()))
        return [];
      return [
        {
          lectureId: lecture.id,
          level: last ? 2 : 1,
          reason: last ? `${interval}일 간격으로 다시 꺼내기` : '첫 꺼내기',
          dueAt: new Date(due).toISOString(),
        },
      ];
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}
const chronologicalReviews = (wp: WeakPoint) =>
  [...wp.reviews].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

export const gapKind = (kind?: GapKind): GapKind => kind ?? 'concept';
export const preselectedGapIds = (gaps: ReadingGap[]): string[] => {
  const paper = new Set(
    gaps.filter((gap) => gap.source !== 'asked').map((gap) => normalize(gap.concept)),
  );
  return gaps
    .filter((gap) =>
      gap.source === 'asked'
        ? paper.has(normalize(gap.concept))
        : gap.kind === 'self-flagged' || !gap.uncertain,
    )
    .map((gap) => gap.id);
};
export const isQuickReview = (wp: WeakPoint, now: Date): boolean =>
  localDay(new Date(wp.createdAt)) === localDay(now);
const countedReviews = (wp: WeakPoint) =>
  chronologicalReviews(wp).filter(
    (review) => !review.practice && !review.quick && !isQuickReview(wp, new Date(review.date)),
  );

// Missing step metadata never proves a step-2 success. Keep legacy correct days
// as prior practice, and recognize legacy retention failures when replaying imports.
function progress(wp: WeakPoint) {
  const days = new Set<string>();
  let resolved = false;
  const legacyDays = new Set<string>();
  for (const review of countedReviews(wp)) {
    if (!review.correct) {
      if (review.retention || resolved || legacyDays.size >= 2) {
        days.clear();
        legacyDays.clear();
        resolved = false;
      }
      continue;
    }
    if (review.hinted) continue;
    const date = localDay(new Date(review.date));
    if (review.step === undefined) legacyDays.add(date);
    if (review.step === 2 && [...days].some((prior) => prior !== date)) resolved = true;
    days.add(date);
  }
  return { days, resolved };
}
export function reviewProgress(wp: WeakPoint): { step: 1 | 2; correctDays: number } {
  const { days } = progress(wp);
  return {
    step: wp.resolvedAt || days.size > 0 ? 2 : 1,
    correctDays: wp.resolvedAt ? 2 : Math.min(1, days.size),
  };
}

export interface ReviewOptions {
  step?: 1 | 2;
  hinted?: boolean;
  practice?: boolean;
}
/** When the weak point next becomes due; undefined once its retention check is done. */
export function nextReviewAt(wp: WeakPoint): Date | undefined {
  if (wp.resolvedAt)
    return wp.retainedAt ? undefined : new Date(dayStart(Date.parse(wp.resolvedAt), 21));
  const reviews = countedReviews(wp);
  // The streak counts correct days, not answers: two right answers on one day are one step.
  let streak = 0;
  let lastCorrectDay = '';
  for (const review of reviews) {
    if (!review.correct) {
      streak = 0;
      lastCorrectDay = '';
    } else if (!review.hinted) {
      const date = localDay(new Date(review.date));
      if (date !== lastCorrectDay) streak += 1;
      lastCorrectDay = date;
    }
  }
  const last = Math.max(Date.parse(wp.createdAt), Date.parse(reviews.at(-1)?.date ?? wp.createdAt));
  const days = streak === 0 ? 1 : streak === 1 ? 3 : 7;
  return new Date(dayStart(last, days));
}
export function dueWeakPoints(all: WeakPoint[], now: Date): WeakPoint[] {
  return all.filter((wp) => {
    const next = nextReviewAt(wp);
    return next !== undefined && now.getTime() >= next.getTime();
  });
}
export function applyReview(
  wp: WeakPoint,
  correct: boolean,
  now: Date,
  questionId?: string,
  options: ReviewOptions = {},
): WeakPoint {
  const retentionDue = Boolean(
    !options.practice &&
    wp.resolvedAt &&
    !wp.retainedAt &&
    now.getTime() >= dayStart(Date.parse(wp.resolvedAt), 21),
  );
  const reviews = [
    ...wp.reviews,
    {
      date: now.toISOString(),
      correct,
      ...(questionId ? { questionId } : {}),
      step: options.step ?? 1,
      hinted: options.hinted ?? false,
      quick: isQuickReview(wp, now),
      ...(options.practice ? { practice: true } : {}),
      ...(retentionDue ? { retention: true } : {}),
    },
  ];
  const updated: WeakPoint = { ...wp, reviews };
  if (options.practice || isQuickReview(wp, now)) return updated;
  if (wp.resolvedAt) {
    if (!retentionDue) return updated;
    if (correct && !options.hinted && options.step === 2) updated.retainedAt = now.toISOString();
    else if (!correct) {
      delete updated.resolvedAt;
      delete updated.retainedAt;
    }
    return updated;
  }
  if (correct && !options.hinted && options.step === 2 && progress(updated).resolved)
    updated.resolvedAt = now.toISOString();
  return updated;
}
export function weakPointsFromConfirmedGaps(
  course: Course,
  lecture: Lecture,
  reading: Reading,
  confirmedGapIds: string[],
  now: Date,
): WeakPoint[] {
  const confirmed = new Set(confirmedGapIds);
  // One concept can be both observed on paper and discussed in chat. Preserve
  // the paper diagnosis if both suggestions are selected, without duplicate points.
  const selected = reading.gaps.filter((gap) => confirmed.has(gap.id));
  const unique = new Map<string, ReadingGap>();
  for (const gap of selected) {
    const key = normalize(gap.concept);
    const prior = unique.get(key);
    if (!prior || (prior.source === 'asked' && gap.source !== 'asked')) unique.set(key, gap);
  }
  return [...unique.values()].map((gap) => ({
    id: newId(),
    courseId: course.id,
    lectureId: lecture.id,
    concept: gap.concept,
    detail: gap.why,
    gapKind: gapKind(gap.kind),
    ...(gap.noteSection ? { noteSection: gap.noteSection } : {}),
    createdAt: now.toISOString(),
    reviews: [],
  }));
}
