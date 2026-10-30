import type { Note, Skeleton, WeakPoint } from './types';
export const now = '2026-10-01T12:00:00.000Z';
export function noteFixture(): Note {
  return {
    bigPicture: {
      question: 'What is the central idea?',
      chunks: [
        { title: 'Start', gist: 'Initial context' },
        { title: 'Middle', gist: 'Main idea' },
        { title: 'End', gist: 'Application' },
      ],
    },
    sections: [
      {
        title: 'Topic',
        chunk: 'Middle',
        points: [
          {
            text: 'A synthetic concept has two parts.',
            fromHandwriting: false,
            evidence: ['A synthetic concept has two parts.'],
          },
        ],
        myHandwriting: [],
      },
    ],
    model: 'gemini-3.8-flash',
    promptVersion: 'digest-v1',
    createdAt: now,
  };
}
export function skeletonFixture(): Skeleton {
  return {
    bundles: [
      {
        title: 'Topic',
        chunk: 'Middle',
        wordBank: ['concept'],
        definitions: [{ term: 'concept', definition: 'A synthetic concept has two parts.' }],
        blanks: [{ sentence: 'The recalled term is ___.', answer: 'concept' }],
      },
    ],
    examples: [],
    weakFromCourse: [],
    leakWarnings: [],
    model: 'gemini-3.8-flash',
    promptVersion: 'skeleton-v1',
    createdAt: now,
  };
}
export function weakFixture(): WeakPoint {
  return {
    id: 'wp1',
    courseId: 'c1',
    lectureId: 'l1',
    concept: 'Synthetic concept',
    detail: 'Needs recall',
    createdAt: now,
    reviews: [],
  };
}
export function notePayload() {
  const { bigPicture, sections } = noteFixture();
  return { bigPicture, sections };
}
export function geminiResponse(value: unknown): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    usageMetadata: {
      promptTokenCount: 100,
      candidatesTokenCount: 20,
      thoughtsTokenCount: 10,
      cachedContentTokenCount: 40,
    },
  });
}
export function claudeResponse(value: unknown, freeText = false): Response {
  return Response.json({
    content: [{ type: 'text', text: freeText ? value : JSON.stringify(value) }],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_creation_input_tokens: 30,
      cache_read_input_tokens: 40,
    },
  });
}
