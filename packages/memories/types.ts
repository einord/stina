import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import { memoriesTable } from './schema.js';

export type Memory = {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
};
export type NewMemory = InferInsertModel<typeof memoriesTable>;
export type MemoryRow = InferSelectModel<typeof memoriesTable>;

export type MemoryInput = {
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

export type MemoryUpdate = Partial<MemoryInput>;
