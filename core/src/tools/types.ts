import { DataRepository, TodoFilter } from "../data/repository.js";

export interface ToolContext {
  repo: DataRepository;
}

export interface TodoCreateInput {
  title: string;
  projectId?: string | null;
  due?: string | null;
  notes?: string | null;
  priority?: "low" | "normal" | "high";
}

export interface TodoUpdateInput {
  id: string;
  patch: {
    title?: string;
    projectId?: string | null;
    due?: string | null;
    notes?: string | null;
    priority?: "low" | "normal" | "high";
    completed?: boolean;
  };
}

export interface TodoDeleteInput {
  id: string;
}

export interface TodoListInput {
  filter?: TodoFilter;
  limit?: number;
  offset?: number;
}

export interface ProjectCreateInput {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface ProjectListInput {
  query?: string | null;
}

export interface InstructionsUpdateInput {
  patch: {
    reminders?: string[];
    tone?: string;
    workingHours?: Record<string, unknown>;
    routines?: unknown[];
  };
}

export interface ScheduleCreateInput {
  title: string;
  message: string;
  cron: string;
  active?: boolean;
}

export interface ScheduleUpdateInput {
  id: string;
  patch: {
    title?: string;
    message?: string;
    cron?: string;
    active?: boolean;
  };
}

export interface ScheduleListInput {
  activeOnly?: boolean;
}

export interface ProviderConfigInput {
  provider: "openai" | "anthropic" | "ollama" | "mock";
  config: Record<string, unknown>;
}

export interface ProviderConfigListInput {
  provider?: string;
}
