import { decodeBundle } from '../core/api';
import type { Bundle, StoredFile } from '../core/types';

export interface TutorialBundleData {
  bundle: Bundle;
  files: StoredFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertBasicBundle(value: unknown): asserts value is Bundle {
  if (!isRecord(value)) {
    throw new Error('예시 파일의 형식이 올바르지 않아요.');
  }

  if (
    value.format !== 'rrecall-bundle' ||
    value.version !== 1 ||
    typeof value.exportedAt !== 'string' ||
    !Array.isArray(value.courses) ||
    !Array.isArray(value.lectures) ||
    !Array.isArray(value.weakPoints) ||
    !Array.isArray(value.questions) ||
    !Array.isArray(value.chats) ||
    !Array.isArray(value.files)
  ) {
    throw new Error('지원하지 않는 예시 파일이에요.');
  }

  if (value.courses.length === 0 || value.lectures.length === 0) {
    throw new Error('예시 강의가 비어 있어요.');
  }
}

function isCoreStubError(error: unknown): boolean {
  return error instanceof Error && /not implemented/i.test(error.message);
}

export async function loadTutorialBundle(): Promise<TutorialBundleData> {
  const response = await fetch(`${import.meta.env.BASE_URL}tutorial/example-bundle.json`);
  if (!response.ok) {
    throw new Error('튜토리얼 예시를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const json: unknown = await response.json();
  assertBasicBundle(json);

  try {
    return decodeBundle(json);
  } catch (error) {
    if (!isCoreStubError(error)) {
      throw error;
    }

    // The core decoder is temporarily a stub during the parallel build. The
    // bundled tutorial has no binary files, so its validated JSON is usable as-is.
    return { bundle: json, files: [] };
  }
}
