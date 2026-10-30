import { openDB, type DBSchema } from 'idb';
import { defaultSettings } from '../core/api';
import type {
  Attempt,
  Bundle,
  CallUsage,
  ChatThread,
  Course,
  Lecture,
  Question,
  Settings,
  StoredFile,
  WeakPoint,
} from '../core/types';

export interface DataSet {
  attempts: Attempt[];
  courses: Course[];
  lectures: Lecture[];
  files: StoredFile[];
  weakPoints: WeakPoint[];
  questions: Question[];
  chats: ChatThread[];
  usage: CallUsage[];
}
interface Database extends DBSchema {
  attempts: { key: string; value: Attempt };
  courses: { key: string; value: Course };
  lectures: { key: string; value: Lecture };
  files: { key: string; value: StoredFile };
  weakPoints: { key: string; value: WeakPoint };
  questions: { key: string; value: Question };
  chats: { key: string; value: ChatThread };
  usage: { key: number; value: CallUsage };
}
const names = [
  'courses',
  'lectures',
  'files',
  'weakPoints',
  'questions',
  'chats',
  'usage',
  'attempts',
] as const;
let database: ReturnType<typeof openDB<Database>> | undefined;
function db() {
  return (database ??= openDB<Database>('rrecall', 2, {
    upgrade(d) {
      for (const name of names) {
        if (d.objectStoreNames.contains(name)) continue;
        if (name === 'usage') d.createObjectStore(name, { autoIncrement: true });
        else d.createObjectStore(name, { keyPath: 'id' });
      }
    },
  }));
}
export async function all<K extends (typeof names)[number]>(
  name: K,
): Promise<Database[K]['value'][]> {
  return (await db()).getAll(name);
}
export async function put<K extends (typeof names)[number]>(name: K, value: Database[K]['value']) {
  await (await db()).put(name, value);
}
export async function get<K extends (typeof names)[number]>(
  name: K,
  id: Database[K]['key'],
): Promise<Database[K]['value'] | undefined> {
  return (await db()).get(name, id);
}
export async function remove<K extends (typeof names)[number]>(name: K, id: Database[K]['key']) {
  await (await db()).delete(name, id);
}
export async function snapshot(): Promise<DataSet> {
  const [courses, lectures, files, weakPoints, questions, chats, usage, attempts] =
    await Promise.all(names.map((name) => all(name)));
  return { courses, lectures, files, weakPoints, questions, chats, usage, attempts } as DataSet;
}
// Related writes commit together, so a saved lecture never references missing files.
export async function save(data: Partial<DataSet>) {
  const d = await db();
  const tx = d.transaction([...names], 'readwrite');
  for (const name of names) {
    for (const value of data[name] ?? []) {
      // Each array is keyed by its own store name; idb cannot express this union.
      await tx.objectStore(name).put(value);
    }
  }
  await tx.done;
}
/**
 * Deletes a lecture and everything that belongs only to it, in one transaction:
 * material files, blank-recall photos, chat sessions and their attached photos,
 * the lecture's weak points, their questions and attempts. Usage (cost history) is kept.
 */
export async function deleteLecture(lectureId: string) {
  const d = await db();
  const tx = d.transaction([...names], 'readwrite');
  const lecture = await tx.objectStore('lectures').get(lectureId);
  if (!lecture) {
    await tx.done;
    return;
  }
  const chats = (await tx.objectStore('chats').getAll()).filter((c) => c.lectureId === lectureId);
  const points = (await tx.objectStore('weakPoints').getAll()).filter(
    (w) => w.lectureId === lectureId,
  );
  const pointIds = new Set(points.map((w) => w.id));
  const questions = (await tx.objectStore('questions').getAll()).filter((q) =>
    pointIds.has(q.weakPointId),
  );
  const attempts = (await tx.objectStore('attempts').getAll()).filter((a) =>
    pointIds.has(a.weakPointId),
  );
  const fileIds = new Set([
    ...lecture.materialFileIds,
    ...lecture.recalls.flatMap((r) => r.photoFileIds),
    ...chats.flatMap((c) => c.messages.flatMap((m) => m.imageFileIds ?? [])),
  ]);
  for (const id of fileIds) await tx.objectStore('files').delete(id);
  for (const c of chats) await tx.objectStore('chats').delete(c.id);
  for (const a of attempts) await tx.objectStore('attempts').delete(a.id);
  for (const q of questions) await tx.objectStore('questions').delete(q.id);
  for (const w of points) await tx.objectStore('weakPoints').delete(w.id);
  await tx.objectStore('lectures').delete(lectureId);
  await tx.done;
}
export async function importBundle(bundle: Bundle, files: StoredFile[]) {
  // Import is an atomic replacement; the settings and key are never in a bundle.
  const tx = (await db()).transaction([...names], 'readwrite');
  for (const name of names) {
    await tx.objectStore(name).clear();
    const values = name === 'files' ? files : (bundle[name] ?? []);
    for (const value of values) await tx.objectStore(name).put(value);
  }
  await tx.done;
}
export function readSettings(): Settings {
  let fallback: Settings;
  try {
    fallback = defaultSettings();
  } catch {
    fallback = { preset: 'standard', overrides: {}, outputLanguage: 'ko', rememberKey: true };
  }
  try {
    const saved = JSON.parse(localStorage.getItem('rrecall.settings') ?? 'null');
    if (
      !saved ||
      !['saver', 'standard', 'quality'].includes(saved.preset) ||
      !['ko', 'en'].includes(saved.outputLanguage) ||
      typeof saved.rememberKey !== 'boolean' ||
      !saved.overrides ||
      typeof saved.overrides !== 'object' ||
      Array.isArray(saved.overrides)
    )
      return fallback;
    return {
      preset: saved.preset,
      overrides: saved.overrides,
      outputLanguage: saved.outputLanguage,
      rememberKey: saved.rememberKey,
    };
  } catch {
    return fallback;
  }
}
export function writeSettings(settings: Settings) {
  localStorage.setItem('rrecall.settings', JSON.stringify(settings));
}
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function storedFile(file: File): StoredFile {
  return {
    id: newId(),
    name: file.name,
    mime:
      file.type ||
      (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
    size: file.size,
    blob: file,
    createdAt: now(),
  };
}
