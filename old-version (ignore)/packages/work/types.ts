import { type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import {
  projectsTable,
  recurringTemplatesTable,
  todoCommentsTable,
  todoStepsTable,
  todosTable,
  recurringTemplateStepsTable,
} from './schema.js';

export type TodoStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export type Todo = {
  id: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  dueAt: number | null;
  isAllDay: boolean;
  reminderMinutes: number | null;
  steps?: TodoStep[];
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  icon?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  recurringTemplateId?: string | null;
  createdAt: number;
  updatedAt: number;
  commentCount?: number;
};
export type NewTodo = InferInsertModel<typeof todosTable>;
export type TodoRow = InferSelectModel<typeof todosTable>;

export type TodoStep = {
  id: string;
  todoId: string;
  title: string;
  isDone: boolean;
  orderIndex: number;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TodoStepInput = {
  title: string;
  isDone?: boolean;
  orderIndex?: number;
};

export type TodoStepUpdate = Partial<Omit<TodoStepInput, 'title'>> & { title?: string };

export type NewTodoStep = InferInsertModel<typeof todoStepsTable>;
export type TodoStepRow = InferSelectModel<typeof todoStepsTable>;

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
  steps?: TodoStepInput[];
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  icon?: string | null;
  projectId?: string | null;
  recurringTemplateId?: string | null;
};

export type TodoUpdate = Partial<Omit<TodoInput, 'title'>> & {
  title?: string;
};

export type TodoQuery = {
  limit?: number;
  includeArchived?: boolean;
};

export type ProjectInput = {
  name: string;
  description?: string | null;
};

export type ProjectUpdate = Partial<ProjectInput>;

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';
export type RecurringLeadTimeUnit = 'hours' | 'days' | 'after_completion';
export type RecurringOverlapPolicy = 'skip_if_open' | 'allow_multiple' | 'replace_open';

export type RecurringTemplate = {
  id: string;
  title: string;
  description?: string | null;
  projectId?: string | null;
  isAllDay: boolean;
  timeOfDay?: string | null;
  timezone?: string | null;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null; // legacy single day
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  months?: number[] | null;
  monthOfYear?: number | null;
  cron?: string | null;
  leadTimeMinutes: number;
  leadTimeValue: number;
  leadTimeUnit: RecurringLeadTimeUnit;
  reminderMinutes?: number | null;
  steps?: RecurringTemplateStep[];
  overlapPolicy: RecurringOverlapPolicy;
  lastGeneratedDueAt?: number | null;
  enabled: boolean;
  icon?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type NewRecurringTemplate = InferInsertModel<typeof recurringTemplatesTable>;
export type RecurringTemplateRow = InferSelectModel<typeof recurringTemplatesTable>;

export type RecurringTemplateStep = {
  id: string;
  templateId: string;
  title: string;
  orderIndex: number;
  createdAt: number;
  updatedAt: number;
};

export type RecurringTemplateStepInput = {
  title: string;
  orderIndex?: number;
};

export type RecurringTemplateStepUpdate = Partial<RecurringTemplateStepInput>;

export type NewRecurringTemplateStep = InferInsertModel<typeof recurringTemplateStepsTable>;
export type RecurringTemplateStepRow = InferSelectModel<typeof recurringTemplateStepsTable>;

export type RecurringTemplateInput = {
  title: string;
  description?: string | null;
  projectId?: string | null;
  isAllDay?: boolean;
  timeOfDay?: string | null;
  timezone?: string | null;
  frequency: RecurringFrequency;
  dayOfWeek?: number | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  months?: number[] | null;
  monthOfYear?: number | null;
  cron?: string | null;
  leadTimeMinutes?: number;
  leadTimeValue?: number;
  leadTimeUnit?: RecurringLeadTimeUnit;
  reminderMinutes?: number | null;
  steps?: RecurringTemplateStepInput[];
  overlapPolicy?: RecurringOverlapPolicy;
  enabled?: boolean;
  icon?: string | null;
};

export type RecurringTemplateUpdate = Partial<RecurringTemplateInput> & {
  lastGeneratedDueAt?: number | null;
};
