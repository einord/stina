export type MemoryItem = {
  id: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MemoryInput = {
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

export type MemoryUpdate = Partial<Omit<MemoryItem, 'id' | 'createdAt'>>;
