import type { FileRegistry } from '../lib/fileRegistry';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRecord {
  id: string;
  title: string;
  model: string;
  preset: string;
  messages: Message[];
  updatedAt: number;
  fileEntries?: Array<{ path: string; content: string; lang: string; updatedAt: number }>;
}

export interface Panel {
  id: string;
  title: string;
  model: string;
  preset: string;           // preset id, e.g. 'code' | 'chatbot' | 'creative'
  messages: Message[];
  streaming: boolean;
  streamingContent: string;
  fileRegistry: FileRegistry;
  // Snapshot of registry BEFORE the current response — used to compute diffs
  prevRegistry: FileRegistry;
}

export type OllamaStatus = 'connecting' | 'online' | 'error';
