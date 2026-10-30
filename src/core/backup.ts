import type { Bundle, StoredFile } from './types';
import { base64ToBytes, blobToBase64 } from './binary';
import { arr, bool, matchesSchema, num, obj, str } from './schemas';
import type { Schema } from './schemas';

// Backup validation follows the stored contract, not stricter model-generation limits.
const meta = { model: str, promptVersion: str, createdAt: str };
const note = obj({
  ...meta,
  bigPicture: obj({
    question: str,
    chunks: arr(obj({ title: str, gist: str, toNext: str }, ['toNext'])),
  }),
  sections: arr(
    obj(
      {
        title: str,
        chunk: str,
        points: arr(
          obj({ text: str, evidence: arr(str), verified: bool, fromHandwriting: bool }, [
            'verified',
            'fromHandwriting',
          ]),
        ),
        myHandwriting: arr(obj({ text: str, where: str, meaning: str })),
      },
      ['chunk'],
    ),
  ),
});
const skeleton = obj({
  ...meta,
  bundles: arr(
    obj(
      {
        title: str,
        chunk: str,
        definitions: arr(obj({ term: str, definition: str })),
        wordBank: arr(str),
        blanks: arr(obj({ sentence: str, answer: str })),
      },
      ['chunk', 'definitions'],
    ),
  ),
  examples: arr(str),
  weakFromCourse: arr(str),
  leakWarnings: arr(str),
});
const readingItem = obj({ text: str, concept: str, uncertain: bool }, ['concept', 'uncertain']);
const gapKind: Schema = {
  type: 'string',
  enum: ['term', 'concept', 'section', 'self-flagged', 'corrected'],
};
const gapSource: Schema = { type: 'string', enum: ['paper', 'asked'] };
const reading = obj(
  {
    ...meta,
    meaningLinesMissing: bool,
    recalled: arr(readingItem),
    corrected: arr(readingItem),
    gaps: arr(
      obj(
        {
          id: str,
          concept: str,
          why: str,
          kind: gapKind,
          source: gapSource,
          noteSection: str,
          uncertain: bool,
        },
        ['kind', 'source', 'noteSection', 'uncertain'],
      ),
    ),
  },
  ['meaningLinesMissing'],
);
const recall = obj(
  {
    id: str,
    date: str,
    level: { type: 'number', enum: [1, 2, 3] },
    photoFileIds: arr(str),
    typedText: str,
    reading,
    confirmedGapIds: arr(str),
    confirmedAt: str,
  },
  ['level', 'typedText', 'reading', 'confirmedGapIds', 'confirmedAt'],
);
const bundleSchema = obj(
  {
    format: { type: 'string', enum: ['rrecall-bundle'] },
    version: num,
    exportedAt: str,
    courses: arr(obj({ id: str, name: str, description: str, createdAt: str }, ['description'])),
    lectures: arr(
      obj(
        {
          id: str,
          courseId: str,
          title: str,
          date: str,
          transcript: arr(obj({ t: num, speaker: str, text: str }, ['t', 'speaker'])),
          transcriptSource: str,
          materialFileIds: arr(str),
          note,
          skeleton,
          recalls: arr(recall),
        },
        ['transcriptSource', 'note', 'skeleton'],
      ),
    ),
    weakPoints: arr(
      obj(
        {
          id: str,
          courseId: str,
          lectureId: str,
          concept: str,
          detail: str,
          gapKind,
          noteSection: str,
          createdAt: str,
          reviews: arr(
            obj(
              {
                date: str,
                correct: bool,
                questionId: str,
                step: { type: 'number', enum: [1, 2] },
                hinted: bool,
                retention: bool,
                quick: bool,
                practice: bool,
              },
              ['questionId', 'step', 'hinted', 'retention', 'quick', 'practice'],
            ),
          ),
          resolvedAt: str,
          retainedAt: str,
        },
        ['gapKind', 'noteSection', 'resolvedAt', 'retainedAt'],
      ),
    ),
    questions: arr(
      obj(
        {
          id: str,
          weakPointId: str,
          kind: {
            type: 'string',
            enum: ['term', 'explain', 'apply', 'connect', 'blank', 'short'],
          },
          step: { type: 'number', enum: [1, 2] },
          prompt: str,
          answer: str,
          evidence: str,
        },
        ['step'],
      ),
    ),
    attempts: arr(
      obj(
        {
          id: str,
          questionId: str,
          weakPointId: str,
          answer: str,
          grade: obj(
            { correct: bool, feedback: str, missing: arr(str), hint: str, followUp: str },
            ['hint', 'followUp'],
          ),
          at: str,
          attemptNumber: { type: 'number', enum: [1, 2] },
          hinted: bool,
          gaveUp: bool,
          quick: bool,
          practice: bool,
        },
        ['attemptNumber', 'hinted', 'gaveUp', 'quick', 'practice'],
      ),
    ),
    chats: arr(
      obj(
        {
          id: str,
          courseId: str,
          lectureId: str,
          purpose: { type: 'string', enum: ['before-recall', 'after-reading'] },
          title: str,
          createdAt: str,
          messages: arr(
            obj(
              {
                role: { type: 'string', enum: ['user', 'assistant'] },
                text: str,
                at: str,
                imageFileIds: arr(str),
                estimatedCredits: num,
              },
              ['imageFileIds', 'estimatedCredits'],
            ),
          ),
        },
        ['title', 'createdAt'],
      ),
    ),
    files: arr(obj({ id: str, name: str, mime: str, size: num, createdAt: str, base64: str })),
    usage: arr(
      obj(
        {
          role: { type: 'string', enum: ['digest', 'skeleton', 'reading', 'tutor'] },
          model: str,
          inputTokens: num,
          outputTokens: num,
          thoughtTokens: num,
          cacheReadTokens: num,
          cacheWriteTokens: num,
          estimatedCredits: num,
          at: str,
        },
        [
          'inputTokens',
          'outputTokens',
          'thoughtTokens',
          'cacheReadTokens',
          'cacheWriteTokens',
          'estimatedCredits',
        ],
      ),
    ),
    attribution: str,
    simulatedDates: bool,
  },
  ['attempts', 'usage', 'attribution', 'simulatedDates'],
);
// JSON.stringify removes optional undefined fields when exporting typed in-memory objects.
export async function encodeBundle(
  data: Omit<Bundle, 'format' | 'version' | 'exportedAt' | 'files'>,
  files: StoredFile[],
  now: Date,
): Promise<Bundle> {
  const encoded = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.blob.size,
      createdAt: file.createdAt,
      base64: await blobToBase64(file.blob),
    })),
  );
  const bundle: Bundle = {
    ...data,
    format: 'rrecall-bundle',
    version: 1,
    exportedAt: now.toISOString(),
    files: encoded,
  };
  return JSON.parse(JSON.stringify(bundle)) as Bundle;
}
export function decodeBundle(json: unknown): { bundle: Bundle; files: StoredFile[] } {
  let value: unknown = json;
  if (typeof json === 'string') {
    try {
      value = JSON.parse(json);
    } catch {
      throw new Error('백업 JSON 파일을 읽지 못했어요.');
    }
  }
  if (!matchesSchema(value, bundleSchema as Schema) || (value as Bundle).version !== 1)
    throw new Error('지원하지 않거나 손상된 rRecall 백업이에요.');
  const bundle = value as Bundle;
  const seen = new Set<string>();
  const files = bundle.files.map((file) => {
    const { base64, ...meta } = file;
    const bytes = base64ToBytes(base64);
    if (bytes.byteLength !== file.size || seen.has(file.id))
      throw new Error('백업 파일 크기나 식별자가 올바르지 않아요.');
    seen.add(file.id);
    return { ...meta, blob: new Blob([bytes], { type: file.mime }) };
  });
  return { bundle, files };
}
