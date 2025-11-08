export type TodoStatus = 'pending' | 'completed';

export type TodoItem = {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
  dueAt?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TodoInput = {
  title: string;
  description?: string;
  dueAt?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

export type TodoUpdate = Partial<Omit<TodoItem, 'id' | 'createdAt'>>;
