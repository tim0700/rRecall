import type { CallUsage, ModelChoice, Role, StoredFile } from './types';
import type { Schema } from './schemas';
export interface GenerationInput {
  choice: ModelChoice;
  role: Role;
  system: string;
  messages: { role: 'user' | 'assistant'; text: string }[];
  files?: StoredFile[];
  schema?: Schema;
  maxTokens: number;
  lowThinking?: boolean;
  signal?: AbortSignal;
}
export interface GenerationOutput {
  text: string;
  usage: CallUsage;
}
