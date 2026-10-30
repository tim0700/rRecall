import { normalize } from './checks';
import type { Note, ReadingGap, Skeleton } from './types';

// Fixed lexical order is stable across reloads and does not expose distractor provenance.
export function skeletonHintBank(skeleton: Skeleton, bundleIndex: number): string[] {
  const bundle = skeleton.bundles[bundleIndex];
  if (!bundle) return [];
  const unique = (terms: string[]) => {
    const seen = new Set<string>();
    return terms.filter((term) => {
      const key = normalize(term);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const own = unique([...bundle.wordBank, ...bundle.blanks.map((blank) => blank.answer)]);
  const ownKeys = new Set(own.map(normalize));
  const order = (a: string, b: string) =>
    normalize(a) < normalize(b) ? -1 : normalize(a) > normalize(b) ? 1 : 0;
  const distractors = unique(
    skeleton.bundles.flatMap((other, index) =>
      index === bundleIndex
        ? []
        : [...other.wordBank, ...other.blanks.map((blank) => blank.answer)],
    ),
  )
    .filter((term) => !ownKeys.has(normalize(term)))
    .sort(order)
    .slice(0, 2);
  return [...own, ...distractors].sort(order);
}

/** Ground gap labels in the requested scope. Explicit learner uncertainty is preserved. */
export function guardReadingGaps<T extends Omit<ReadingGap, 'id'>>(
  gaps: T[],
  note: Note,
  skeleton: Skeleton,
  askedTopics: string[] = [],
  meaningLinesMissing = false,
): T[] {
  const labels = [
    ...skeleton.bundles.flatMap((bundle) => [
      ...bundle.wordBank,
      ...bundle.blanks.map((blank) => blank.answer),
      ...(bundle.definitions ?? []).map((definition) => definition.term),
    ]),
    ...note.sections.map((section) => section.title),
    ...askedTopics,
  ]
    .map(normalize)
    .filter(Boolean);
  return gaps.filter((gap) => {
    if (gap.kind === 'self-flagged') return true;
    if (meaningLinesMissing && gap.source !== 'asked' && (gap.kind ?? 'concept') === 'concept')
      return false;
    const concept = normalize(gap.concept);
    return (
      Boolean(concept) && labels.some((label) => label.includes(concept) || concept.includes(label))
    );
  });
}
