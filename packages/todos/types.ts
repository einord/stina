import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import { todoCommentsTable, todosTable } from './schema.js';

export type TodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  dueAt: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
};
export type NewTodo = InferInsertModel<typeof todosTable>;
export type TodoRow = InferSelectModel<typeof todosTable>;

export type TodoComment = {
  id: string;
  todoId: string;
  content: string;
  createdAt: number;
};
export type NewTodoComment = InferInsertModel<typeof todoCommentsTable>;
export type TodoCommentRow = InferSelectModel<typeof todoCommentsTable>;

export type TodoInput = {
  title: string;
  description?: string;
  status?: TodoStatus;
  dueAt?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
};

export type TodoUpdate = Partial<Omit<TodoInput, 'title'>> & {
  title?: string;
};

export type TodoQuery = {
  status?: TodoStatus;
  limit?: number;
};
