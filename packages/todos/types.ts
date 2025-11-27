import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import { projectsTable, todoCommentsTable, todosTable } from './schema.js';

export type TodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  dueAt: number | null;
  isAllDay: boolean;
  reminderMinutes: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
};
export type NewTodo = InferInsertModel<typeof todosTable>;
export type TodoRow = InferSelectModel<typeof todosTable>;

export type Project = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: number;
  updatedAt: number;
};
export type NewProject = InferInsertModel<typeof projectsTable>;
export type ProjectRow = InferSelectModel<typeof projectsTable>;

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
  isAllDay?: boolean;
  reminderMinutes?: number | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  projectId?: string | null;
};

export type TodoUpdate = Partial<Omit<TodoInput, 'title'>> & {
  title?: string;
};

export type TodoQuery = {
  status?: TodoStatus;
  limit?: number;
};

export type ProjectInput = {
  name: string;
  description?: string | null;
};

export type ProjectUpdate = Partial<ProjectInput>;
