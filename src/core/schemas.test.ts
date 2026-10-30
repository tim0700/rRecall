import { describe, expect, it } from 'vitest';
import { coerceToSchema, parseResponse, skeletonSchema, obj, arr, text, str } from './schemas';

describe('tolerant response shaping', () => {
  it('truncates arrays over maxItems and drops items that do not fit', () => {
    const shaped = coerceToSchema(
      {
        bundles: [
          {
            title: 'T',
            chunk: '',
            definitions: [
              { term: 'a', definition: '' },
              { term: 'b', definition: 'B' },
            ],
            wordBank: ['a', 'b', 'c', 'd', 'e'],
            blanks: [{ sentence: 'x ___', answer: 'a' }],
            extra: 'ignored',
          },
        ],
        examples: ['', 'Example'],
      },
      skeletonSchema,
    ) as any;
    expect(shaped.bundles[0].wordBank).toEqual(['a', 'b', 'c', 'd']);
    expect(shaped.bundles[0].definitions).toEqual([{ term: 'b', definition: 'B' }]);
    expect('extra' in shaped.bundles[0]).toBe(false);
    expect(shaped.examples).toEqual(['Example']);
  });
  it('fills a missing required array without a minimum and keeps optional fields absent', () => {
    const schema = obj({ list: arr(text), more: arr(text), note: str }, ['note']);
    expect(coerceToSchema({ more: [] }, schema)).toEqual({ list: [], more: [] });
  });
  it('rejects an object that has none of its required fields', () => {
    const schema = obj({ list: arr(text), note: str }, ['note']);
    expect(coerceToSchema({}, schema)).toBeUndefined();
    expect(coerceToSchema({ foo: 1 }, schema)).toBeUndefined();
  });
  it('still rejects when a required value is missing or below minItems', () => {
    expect(coerceToSchema({ examples: [] }, skeletonSchema)).toBeUndefined();
    expect(() => parseResponse('{"bundles": [], "examples": []}', skeletonSchema)).toThrow();
    expect(() => parseResponse('not json', skeletonSchema)).toThrow();
  });
});
