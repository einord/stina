export type MemoryItem = {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type MemoryInput = {
  title: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

export type MemoryUpdate = Partial<Omit<MemoryItem, 'id' | 'createdAt'>>;
