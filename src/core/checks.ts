import type { Note, Question, Segment, Skeleton, SkeletonBundle } from './types';
export function validNoteChunks(note: Pick<Note, 'bigPicture' | 'sections'>): boolean {
  const titles = new Set(note.bigPicture.chunks.map((chunk) => chunk.title));
  return note.sections.every((section) => section.chunk !== undefined && titles.has(section.chunk));
}
export function filterDefinitions(bundle: SkeletonBundle): SkeletonBundle {
  return {
    ...bundle,
    definitions: bundle.definitions?.filter(({ term }) => bundle.wordBank.includes(term)),
  };
}
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}`´]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
export function quoteExists(quote: string, text: string): boolean {
  const needle = normalize(quote);
  return needle.length > 0 && normalize(text).includes(needle);
}
export function verifyNote(note: Note, transcript: Segment[]): Note {
  const text = transcript.map((s) => s.text).join('\n');
  return {
    ...note,
    sections: note.sections.map((section) => ({
      ...section,
      points: section.points.map((point) => ({
        ...point,
        verified: point.evidence.some((q) => quoteExists(q, text)),
      })),
    })),
  };
}
export function noteText(note: Note): string {
  return note.sections
    .flatMap((s) => [s.title, ...s.points.flatMap((p) => [p.text, ...p.evidence])])
    .join('\n');
}
export interface SkeletonLeak {
  answer: string;
  location: string;
}
export function findLeaks(skeleton: Pick<Skeleton, 'bundles' | 'examples'>): SkeletonLeak[] {
  const lines = [
    ...skeleton.bundles.flatMap((b, i) => [
      { text: b.title, location: `묶음 ${i + 1} 제목` },
      ...b.blanks.map((blank, j) => ({
        text: blank.sentence,
        location: `묶음 ${i + 1} 빈칸 ${j + 1}`,
      })),
    ]),
    ...skeleton.examples.map((text, i) => ({ text, location: `예제 ${i + 1}` })),
  ];
  const answers = new Map(
    skeleton.bundles.flatMap((b) =>
      [
        ...b.wordBank.filter((label) => normalize(label).length >= 2),
        ...b.blanks.map((blank) => blank.answer),
      ].map((answer) => [normalize(answer), answer] as const),
    ),
  );
  return [...answers]
    .filter(([answer]) => answer.length > 0)
    .flatMap(([normalized, answer]) =>
      lines
        .filter((line) => normalize(line.text).includes(normalized))
        .map((line) => ({ answer, location: line.location })),
    );
}
export function verifiedQuestions(
  questions: Question[],
  note: Note,
  previous: Question[] = [],
): Question[] {
  const text = noteText(note);
  const seen = new Set(previous.map((q) => `${q.weakPointId}:${normalize(q.prompt)}`));
  return questions.filter((q) => {
    const key = `${q.weakPointId}:${normalize(q.prompt)}`;
    const answer = normalize(q.answer);
    if (
      !answer ||
      normalize(q.prompt).includes(answer) ||
      !quoteExists(q.evidence, text) ||
      seen.has(key)
    )
      return false;
    seen.add(key);
    return true;
  });
}

export function wordBankWarnings(skeleton: Pick<Skeleton, 'bundles'>): string[] {
  return skeleton.bundles.flatMap((bundle, i) =>
    bundle.blanks.flatMap((blank, j) =>
      bundle.wordBank.includes(blank.answer)
        ? []
        : [`묶음 ${i + 1} 빈칸 ${j + 1}의 정답이 단어 모음에 없어요. 복습 전에 확인해 주세요.`],
    ),
  );
}
