// Shared data contracts. Single source of truth for core, store, UI and tutorial.
// Changing a field here is a contract change: update docs/design.md section 8.3 too.

export type ISODate = string; // e.g. "2026-10-30T09:00:00+09:00"

// ---------- transcript ----------
export interface Segment {
  t?: number; // seconds from start, if the source had times
  speaker?: string;
  text: string;
}

// ---------- files ----------
export interface StoredFile {
  id: string;
  name: string;
  mime: string; // application/pdf, image/jpeg, image/png, text/plain ...
  size: number;
  blob: Blob;
  createdAt: ISODate;
}

// ---------- models / settings ----------
export type Role = 'digest' | 'skeleton' | 'reading' | 'tutor';
export type Provider = 'gemini' | 'claude';
export type PresetId = 'saver' | 'standard' | 'quality';

export interface ModelChoice {
  provider: Provider;
  model: string; // verified ChatKHU model id only
}

export interface Settings {
  preset: PresetId;
  overrides: Partial<Record<Role, ModelChoice>>; // advanced per-role override
  outputLanguage: 'ko' | 'en';
  rememberKey: boolean;
}

export interface CallUsage {
  role: Role;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCredits?: number; // from list prices; 1 credit = $0.001
  at: ISODate;
}

// ---------- note ----------
export interface NotePoint {
  text: string;
  evidence: string[]; // exact quotes from the transcript
  verified?: boolean; // set by code: at least one quote found in transcript
  fromHandwriting?: boolean; // 2026-10-30: point draws on the learner's own annotation (shown with a small mark)
}

export interface NoteSection {
  title: string;
  chunk?: string; // 2026-10-30: title of the bigPicture chunk this section belongs to (top-down hierarchy)
  points: NotePoint[];
  myHandwriting: { text: string; where: string; meaning: string }[];
}

export interface Note {
  bigPicture: { question: string; chunks: { title: string; gist: string; toNext?: string }[] };
  sections: NoteSection[];
  model: string;
  promptVersion: string;
  createdAt: ISODate;
}

// ---------- skeleton ----------
export interface SkeletonBlank {
  sentence: string; // contains "___" where the answer goes
  answer: string; // never displayed in the skeleton view
}

export interface SkeletonBundle {
  title: string; // 2026-10-30: equals the matching note section title (one bundle per note section)
  chunk?: string; // bigPicture chunk title, for level 2/3 views
  // level-2 answers: each word-bank term with its explanation copied from the note ("노트 설명 기준")
  definitions?: { term: string; definition: string }[];
  wordBank: string[];
  blanks: SkeletonBlank[];
}

export interface Skeleton {
  bundles: SkeletonBundle[];
  examples: string[]; // problem statements only, no solutions
  weakFromCourse: string[]; // names of open weak points in this course
  leakWarnings: string[]; // set by code
  model: string;
  promptVersion: string;
  createdAt: ISODate;
}

// ---------- blank recall + reading ----------
export interface ReadingItem {
  text: string;
  concept?: string;
  uncertain?: boolean;
}

export type GapKind = 'term' | 'concept' | 'section' | 'self-flagged' | 'corrected';

export interface ReadingGap {
  id: string;
  concept: string;
  why: string; // missing | corrected in red | partially recalled ...
  kind?: GapKind; // legacy gaps default to concept
  source?: 'paper' | 'asked'; // legacy gaps default to paper
  noteSection?: string;
  uncertain?: boolean;
}

export interface Reading {
  meaningLinesMissing?: boolean; // level 1: terms only; show guidance instead of meaning gaps
  recalled: ReadingItem[]; // black ink
  corrected: ReadingItem[]; // red ink
  gaps: ReadingGap[];
  model: string;
  promptVersion: string;
  createdAt: ISODate;
}

export type SkeletonLevel = 1 | 2 | 3; // 1 word bank + fill-ins, 2 key terms per section (write definitions), 3 titles only

export interface Recall {
  id: string;
  date: ISODate;
  level?: SkeletonLevel; // which skeleton level the learner recalled with (default 1)
  photoFileIds: string[];
  typedText?: string;
  reading?: Reading;
  confirmedGapIds?: string[]; // gaps the user accepted as weak points
  confirmedAt?: ISODate;
}

// ---------- course / lecture ----------
export interface Course {
  id: string;
  name: string;
  description?: string; // learner-written course memo
  createdAt: ISODate;
}

export interface Lecture {
  id: string;
  courseId: string;
  title: string;
  date: ISODate;
  transcript: Segment[];
  transcriptSource?: string; // e.g. "Clova Note txt", "official transcript"
  materialFileIds: string[];
  note?: Note;
  skeleton?: Skeleton;
  recalls: Recall[];
}

export interface LectureReviewTask {
  lectureId: string;
  level: 1 | 2;
  reason: string;
  dueAt: ISODate;
}

// ---------- weak points / tutor ----------
export interface WeakPoint {
  id: string;
  courseId: string;
  lectureId: string;
  concept: string;
  detail: string;
  gapKind?: GapKind;
  noteSection?: string;
  createdAt: ISODate;
  reviews: {
    date: ISODate;
    correct: boolean;
    questionId?: string;
    step?: 1 | 2;
    hinted?: boolean;
    retention?: boolean;
    quick?: boolean;
    practice?: boolean;
  }[];
  resolvedAt?: ISODate; // two unaided local days, later answer at step 2
  // 2026-10-30: one long-interval retention check about 21 days after resolution.
  // Correct -> retainedAt set (done). Wrong -> resolvedAt cleared, interval restarts at 1 day.
  retainedAt?: ISODate;
}

export interface Question {
  id: string;
  weakPointId: string;
  kind: 'term' | 'explain' | 'apply' | 'connect' | 'blank' | 'short';
  step?: 1 | 2; // missing on legacy questions: step 1
  prompt: string;
  answer: string;
  evidence: string; // must exist in the note text (checked by code)
}

export interface Grade {
  correct: boolean;
  feedback: string;
  missing: string[];
  hint?: string;
  followUp?: string;
}

export interface Attempt {
  id: string;
  questionId: string;
  weakPointId: string;
  answer: string;
  grade: Grade;
  at: ISODate;
  attemptNumber?: 1 | 2;
  hinted?: boolean;
  gaveUp?: boolean;
  quick?: boolean;
  practice?: boolean; // rewrite/follow-up; never contributes to progress or scheduling
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  at: ISODate;
  imageFileIds?: string[]; // 2026-10-30: photos attached to a user question
  estimatedCredits?: number; // on assistant messages: cost of producing this reply
}

export interface ChatThread {
  id: string;
  courseId: string;
  lectureId: string;
  purpose: 'before-recall' | 'after-reading';
  messages: ChatMessage[];
  // 2026-10-30: sessions. Several threads per lecture; only the open session is sent to the model.
  title?: string; // short generated topic; legacy/fallback uses the first question
  createdAt?: ISODate;
}

// ---------- backup / tutorial bundle ----------
export interface Bundle {
  format: 'rrecall-bundle';
  version: 1;
  exportedAt: ISODate;
  courses: Course[];
  lectures: Lecture[];
  weakPoints: WeakPoint[];
  questions: Question[];
  chats: ChatThread[];
  files: (Omit<StoredFile, 'blob'> & { base64: string })[];
  attempts?: Attempt[];
  usage?: CallUsage[];
  // tutorial only: license/attribution text shown with the example content
  attribution?: string;
  simulatedDates?: boolean;
}
