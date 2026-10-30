import type { Lecture, ReadingItem, WeakPoint } from './types';
import { normalize } from './checks';
import { isQuickReview } from './schedule';

const conceptKey = (item: ReadingItem) => normalize(item.concept?.trim() || item.text);

/** Exact normalized concept matches only; do not infer equivalence from similar prose. */
export function recallCalibration(lecture: Lecture, points: WeakPoint[]) {
  const recalls = [...lecture.recalls].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const localPoints = points.filter((point) => point.lectureId === lecture.id);
  const underestimated = new Set<string>();
  const overestimated = new Set<string>();
  const hadRecalled = (key: string, before: string) =>
    recalls.some((recall) => {
      if (!(Date.parse(recall.date) < Date.parse(before)) || !recall.reading || !key) return false;
      const paperGaps = recall.reading.gaps.filter((gap) => gap.source !== 'asked');
      return (
        !paperGaps.some((gap) => normalize(gap.concept) === key) &&
        recall.reading.recalled.some((item) => !item.uncertain && conceptKey(item) === key)
      );
    });
  for (const point of localPoints) {
    const reviews = [...point.reviews]
      .filter(
        (review) =>
          !review.practice && !review.quick && !isQuickReview(point, new Date(review.date)),
      )
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const first = reviews[0];
    if (point.gapKind === 'self-flagged' && first?.correct && !first.hinted)
      underestimated.add(point.concept);
    if (
      reviews.some(
        (review) => !review.correct && hadRecalled(normalize(point.concept), review.date),
      )
    )
      overestimated.add(point.concept);
  }
  for (const recall of recalls) {
    for (const gap of recall.reading?.gaps ?? []) {
      if (gap.source === 'asked' || gap.uncertain) continue;
      if (recall.confirmedGapIds && !recall.confirmedGapIds.includes(gap.id)) continue;
      if (hadRecalled(normalize(gap.concept), recall.date)) overestimated.add(gap.concept);
    }
  }
  return { underestimated: [...underestimated], overestimated: [...overestimated] };
}
