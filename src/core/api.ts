import * as errors from './errors';
import * as keys from './keystore';
import * as gateway from './gateway';
import * as presets from './presets';
import * as transcript from './transcript';
import * as llm from './llm';
import * as schedule from './schedule';
import * as backup from './backup';
import * as markdown from './markdown';

// Public API of src/core. The UI imports ONLY from this file (and types.ts).
// Signatures here are a contract between the core worker and the UI worker.
// Implementations live in sibling modules; these names and signatures are stable.

import type {
  Bundle,
  CallUsage,
  ChatThread,
  Grade,
  Lecture,
  ModelChoice,
  Note,
  PresetId,
  Question,
  Reading,
  Role,
  Segment,
  Settings,
  Skeleton,
  SkeletonLevel,
  StoredFile,
  WeakPoint,
  Course,
  Attempt,
} from './types';

export {
  gapKind,
  preselectedGapIds,
  reviewProgress,
  nextReviewAt,
  isQuickReview,
  lectureReviewTasks,
} from './schedule';
export { recallCalibration } from './calibration';
export { skeletonHintBank } from './recall';
export { sessionTitle } from './session';

// ---------- errors ----------
export { GatewayError } from './errors';
export type { GatewayErrorKind } from './errors';

/** Short Korean message for a student, never containing the key. */
export function explainError(_e: unknown): string {
  return errors.explainError(_e);
}

// ---------- key ----------
export function getKey(): string | null {
  return keys.getKey();
}
export function setKey(_key: string, _remember: boolean): void {
  return keys.setKey(_key, _remember);
}
export function clearKey(): void {
  return keys.clearKey();
}

export interface CreditInfo {
  monthlyQuota: number;
  monthlyRemaining: number;
  renewalDate?: string;
  totalRemaining: number;
}

/** Calls GET /credits/ with the given key. */
export async function checkKey(_key: string): Promise<CreditInfo> {
  return gateway.checkKey(_key);
}
export async function getCredits(): Promise<CreditInfo> {
  return gateway.getCredits();
}
/** Model ids available to this key (GET /models/). */
export async function availableModels(): Promise<string[]> {
  return gateway.availableModels();
}

// ---------- settings / presets ----------
export interface PresetInfo {
  id: PresetId;
  label: string; // Korean, e.g. "기본"
  description: string; // Korean, one sentence
  models: Record<Role, ModelChoice>;
  creditsPerLecture: number; // estimate: digest + skeleton + one reading
  creditsPerTutorSession: number; // estimate: 20 turns
}
export function listPresets(): PresetInfo[] {
  return presets.listPresets();
}
/** Candidate models per role for the advanced setting. */
export function candidateModels(_role: Role): ModelChoice[] {
  return presets.candidateModels(_role);
}
export function resolveModel(_settings: Settings, _role: Role): ModelChoice {
  return presets.resolveModel(_settings, _role);
}
export function defaultSettings(): Settings {
  return presets.defaultSettings();
}

// ---------- transcript import ----------
export interface TranscriptImport {
  segments: Segment[];
  source: string; // "Clova Note", "SRT", "VTT", "텍스트"
  warnings: string[]; // Korean
}
export function parseTranscript(_fileName: string, _text: string): TranscriptImport {
  return transcript.parseTranscript(_fileName, _text);
}

// ---------- model stages ----------
export interface StageResult<T> {
  value: T;
  usage: CallUsage[];
}

export async function digestNote(_input: {
  lectureTitle: string;
  transcript: Segment[];
  materials: StoredFile[]; // PDF and/or images with the user's handwriting
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<Note>> {
  return llm.digestNote(_input);
}

export async function makeSkeleton(_input: {
  note: Note;
  transcript: Segment[];
  openWeakPoints: string[];
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<Skeleton>> {
  return llm.makeSkeleton(_input);
}

export async function readRecall(_input: {
  photos: StoredFile[];
  level?: SkeletonLevel;
  typedText?: string;
  askedTopics?: string[];
  note: Note;
  skeleton: Skeleton;
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<Reading>> {
  return llm.readRecall(_input);
}

export async function makeQuestions(_input: {
  weakPoints: WeakPoint[];
  note: Note;
  count?: number;
  previousQuestions?: Question[];
  attempts?: Attempt[];
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<Question[]>> {
  return llm.makeQuestions(_input);
}

export async function gradeAnswer(_input: {
  question: Question;
  answer: string;
  previousAttempts?: Attempt[];
  note: Note;
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<Grade>> {
  return llm.gradeAnswer(_input);
}

export async function tutorReply(_input: {
  thread: ChatThread; // the current session only
  note: Note;
  userText: string;
  images?: StoredFile[]; // 2026-10-30: photos attached to this question
  pastTopics?: string[]; // titles of earlier sessions on this lecture, so the tutor "remembers" what was asked
  settings: Settings;
  signal?: AbortSignal;
}): Promise<StageResult<string>> {
  return llm.tutorReply(_input);
}

// ---------- weak points (pure) ----------
export async function sessionTopic(
  firstQuestion: string,
  firstReply: string,
  settings: Settings,
): Promise<StageResult<string>> {
  return llm.sessionTopic(firstQuestion, firstReply, settings);
}

/** Due after 1/3/7 days by correct streak, or 21 days after resolution for retention. */
export function dueWeakPoints(_all: WeakPoint[], _now: Date): WeakPoint[] {
  return schedule.dueWeakPoints(_all, _now);
}
/** Two unaided local days, with a later step-2 success; hinted retries do not advance. */
export function applyReview(
  _wp: WeakPoint,
  _correct: boolean,
  _now: Date,
  _questionId?: string,
  _options?: schedule.ReviewOptions,
): WeakPoint {
  return schedule.applyReview(_wp, _correct, _now, _questionId, _options);
}
export function weakPointsFromConfirmedGaps(
  _course: Course,
  _lecture: Lecture,
  _reading: Reading,
  _confirmedGapIds: string[],
  _now: Date,
): WeakPoint[] {
  return schedule.weakPointsFromConfirmedGaps(_course, _lecture, _reading, _confirmedGapIds, _now);
}

// ---------- backup / tutorial bundle (pure) ----------
export async function encodeBundle(
  _data: Omit<Bundle, 'format' | 'version' | 'exportedAt' | 'files'>,
  _files: StoredFile[],
  _now: Date,
): Promise<Bundle> {
  return backup.encodeBundle(_data, _files, _now);
}
export function decodeBundle(_json: unknown): { bundle: Bundle; files: StoredFile[] } {
  return backup.decodeBundle(_json);
}

// ---------- rendering helper ----------
/** Markdown -> sanitized HTML (marked + DOMPurify). All model text goes through this. */
export function renderMarkdown(_md: string): string {
  return markdown.renderMarkdown(_md);
}
