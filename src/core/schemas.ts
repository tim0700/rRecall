import { failure } from './errors';
import { isObject } from './gateway';

export interface Schema {
  type: 'object' | 'array' | 'string' | 'boolean' | 'number';
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: false;
  items?: Schema;
  enum?: (string | number)[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
}
export const str: Schema = { type: 'string' };
export const text: Schema = { type: 'string', minLength: 1 };
export const bool: Schema = { type: 'boolean' };
export const num: Schema = { type: 'number' };
export const arr = (items: Schema, minItems?: number, maxItems?: number): Schema => ({
  type: 'array',
  items,
  ...(minItems === undefined ? {} : { minItems }),
  ...(maxItems === undefined ? {} : { maxItems }),
});
export const obj = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});
export const pointSchema = obj({ text, evidence: arr(text, 1, 2), fromHandwriting: bool });
export const sectionSchema = obj({
  title: text,
  chunk: text,
  points: arr(pointSchema, 1),
  myHandwriting: arr(obj({ text, where: str, meaning: str })),
});
export const noteSchema = obj({
  bigPicture: obj({
    question: text,
    chunks: arr(obj({ title: text, gist: text, toNext: str }, ['toNext']), 3, 5),
  }),
  sections: arr(sectionSchema, 1),
});
export const skeletonSchema = obj(
  {
    bundles: arr(
      obj({
        title: text,
        chunk: str,
        definitions: arr(obj({ term: text, definition: text })),
        wordBank: arr(text, 0, 4),
        blanks: arr(obj({ sentence: text, answer: text }), 0, 3),
      }),
      1,
    ),
    examples: arr(text),
    relatedWeakPoints: arr(text),
  },
  ['relatedWeakPoints'],
);
const readingItem = obj({ text, concept: str, uncertain: bool });
export const gapKindSchema: Schema = {
  type: 'string',
  enum: ['term', 'concept', 'section', 'self-flagged', 'corrected'],
};
export const readingSchema = obj(
  {
    meaningLinesMissing: bool,
    recalled: arr(readingItem),
    corrected: arr(readingItem),
    gaps: arr(
      obj({
        concept: text,
        why: text,
        kind: gapKindSchema,
        source: { type: 'string', enum: ['paper', 'asked'] },
        noteSection: str,
        uncertain: bool,
      }),
    ),
  },
  ['meaningLinesMissing'],
);
export const questionsSchema = obj({
  questions: arr(
    obj({
      weakPointId: text,
      kind: { type: 'string', enum: ['term', 'explain', 'apply', 'connect'] },
      step: { type: 'number', enum: [1, 2] },
      prompt: text,
      answer: text,
      evidence: text,
    }),
  ),
});
export const gradeSchema = obj({
  correct: bool,
  feedback: text,
  missing: arr(text),
  hint: str,
  followUp: str,
});

export function matchesSchema(value: unknown, schema: Schema): boolean {
  if (schema.type === 'object') {
    if (!isObject(value)) return false;
    if (schema.required?.some((key) => !Object.hasOwn(value, key))) return false;
    return Object.entries(value).every(([key, v]) => {
      const child = schema.properties?.[key];
      return child ? matchesSchema(v, child) : schema.additionalProperties !== false;
    });
  }
  if (schema.type === 'array')
    return (
      Array.isArray(value) &&
      (schema.minItems === undefined || value.length >= schema.minItems) &&
      (schema.maxItems === undefined || value.length <= schema.maxItems) &&
      value.every((item) => !schema.items || matchesSchema(item, schema.items))
    );
  if (schema.type === 'string')
    return (
      typeof value === 'string' &&
      (schema.minLength === undefined || value.trim().length >= schema.minLength) &&
      (!schema.enum || schema.enum.includes(value))
    );
  if (schema.type === 'number')
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (!schema.enum || schema.enum.includes(value))
    );
  return typeof value === 'boolean';
}
/**
 * Tolerant shaping of a model response against a schema, so one small slip does not discard a paid
 * response: unknown keys are dropped, arrays longer than maxItems are truncated, array items that do
 * not fit are dropped, and missing optional fields stay absent. Returns undefined only when something
 * the app needs is missing or wrong (a required field, an enum value, an array below minItems).
 */
export function coerceToSchema(value: unknown, schema: Schema): unknown {
  if (schema.type === 'object') {
    if (!isObject(value)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (!Object.hasOwn(value, key)) {
        if (schema.required?.includes(key)) {
          if (child.type === 'array' && !child.minItems) out[key] = [];
          else return undefined;
        }
        continue;
      }
      const shaped = coerceToSchema(value[key], child);
      if (shaped === undefined) {
        if (schema.required?.includes(key)) return undefined;
        continue;
      }
      out[key] = shaped;
    }
    if (schema.additionalProperties !== false)
      for (const [key, v] of Object.entries(value)) if (!(key in out)) out[key] = v;
    return out;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return undefined;
    let items = schema.items
      ? value
          .map((item) => coerceToSchema(item, schema.items!))
          .filter((item) => item !== undefined)
      : [...value];
    if (schema.maxItems !== undefined) items = items.slice(0, schema.maxItems);
    if (schema.minItems !== undefined && items.length < schema.minItems) return undefined;
    return items;
  }
  return matchesSchema(value, schema) ? value : undefined;
}
export function parseResponse<T>(raw: string, schema: Schema): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw failure('bad-response');
  }
  const shaped = coerceToSchema(value, schema);
  if (shaped === undefined) throw failure('bad-response');
  return shaped as T;
}
