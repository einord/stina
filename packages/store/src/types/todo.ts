export type TodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export type TodoItem = {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
  dueAt?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  icon?: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
};

export type TodoInput = {
  title: string;
  description?: string;
  dueAt?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  icon?: string | null;
};

export type TodoUpdate = Partial<Omit<TodoItem, 'id' | 'createdAt'>>;

export type TodoComment = {
  id: string;
  todoId: string;
  content: string;
  createdAt: number;
};
