import { and, eq, like, SQL } from "drizzle-orm";
import { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { createId } from "../utils/id.js";
import { encrypt, decrypt } from "../utils/encryption.js";
import { getEncryptionKey } from "../config/security.js";
import { ProAssistDatabase } from "./db.js";
import {
  instructionSets,
  projects,
  providerConfigs,
  schedules,
  sessions,
  todos
} from "./schema.js";

export type Todo = InferSelectModel<typeof todos>;
export type NewTodo = InferInsertModel<typeof todos>;
export type Project = InferSelectModel<typeof projects>;
export type Schedule = InferSelectModel<typeof schedules>;
export type InstructionSet = InferSelectModel<typeof instructionSets>;
export type ProviderConfig = InferSelectModel<typeof providerConfigs>;
export interface ProviderConfigEntry {
  provider: string;
  config: Record<string, unknown>;
}

export interface TodoFilter {
  projectId?: string | null;
  completed?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
}

const buildFilter = (filter?: TodoFilter): SQL<unknown> | undefined => {
  const clauses: SQL<unknown>[] = [];
  if (!filter) return undefined;
  if (filter.projectId) {
    clauses.push(eq(todos.projectId, filter.projectId));
  }
  if (typeof filter.completed === "boolean") {
    clauses.push(eq(todos.completed, filter.completed));
  }
  if (filter.query) {
    clauses.push(
      like(todos.title, `%${filter.query}%`)
    );
  }
  if (!clauses.length) return undefined;
  return and(...clauses);
};

export class DataRepository {
  constructor(private readonly db: ProAssistDatabase) {}

  async createTodo(input: Omit<NewTodo, "id" | "createdAt" | "updatedAt">): Promise<Todo> {
    const id = createId();
    await this.db.insert(todos).values({ ...input, id });
    return this.getTodo(id);
  }

  async getTodo(id: string): Promise<Todo> {
    const todo = this.db.select().from(todos).where(eq(todos.id, id)).get();
    if (!todo) {
      throw new Error(`Todo not found: ${id}`);
    }
    return todo;
  }

  async listTodos(filter?: TodoFilter): Promise<Todo[]> {
    const where = buildFilter(filter);
    const base = this.db.select().from(todos);
    const filtered = where ? base.where(where) : base;
    const ordered = filtered.orderBy(todos.createdAt);
    const limited = typeof filter?.limit === "number" ? ordered.limit(filter.limit) : ordered;
    const offseted = typeof filter?.offset === "number" ? limited.offset(filter.offset) : limited;
    return offseted.all();
  }

  async updateTodo(
    id: string,
    patch: Partial<Omit<NewTodo, "id">>
  ): Promise<Todo> {
    await this.db.update(todos).set({ ...patch, updatedAt: new Date() }).where(eq(todos.id, id));
    return this.getTodo(id);
  }

  async deleteTodo(id: string): Promise<void> {
    await this.db.delete(todos).where(eq(todos.id, id));
  }

  async createProject(
    input: Omit<InferInsertModel<typeof projects>, "id" | "createdAt" | "updatedAt">
  ): Promise<Project> {
    const id = createId();
    await this.db.insert(projects).values({ ...input, id });
    return this.getProject(id);
  }

  async getProject(id: string): Promise<Project> {
    const project = this.db.select().from(projects).where(eq(projects.id, id)).get();
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }
    return project;
  }

  async listProjects(query?: string): Promise<Project[]> {
    const selection = this.db.select().from(projects);
    if (query) {
      return selection.where(like(projects.name, `%${query}%`)).all();
    }
    return selection.all();
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.delete(projects).where(eq(projects.id, id));
  }

  async upsertInstructionSet(data: string): Promise<InstructionSet> {
    const existing = this.db.select().from(instructionSets).limit(1).all();
    if (existing.length) {
      await this.db
      .update(instructionSets)
        .set({ data, updatedAt: new Date() })
        .where(eq(instructionSets.id, existing[0].id));
      return { ...existing[0], data };
    }
    const id = createId();
    await this.db.insert(instructionSets).values({ id, data });
    return { id, data, createdAt: new Date(), updatedAt: new Date() };
  }

  async getInstructionSet(): Promise<InstructionSet | null> {
    const record = this.db.select().from(instructionSets).limit(1).get();
    return record ?? null;
  }

  async createSchedule(
    input: Omit<InferInsertModel<typeof schedules>, "id" | "createdAt" | "updatedAt">
  ): Promise<Schedule> {
    const id = createId();
    await this.db.insert(schedules).values({ ...input, id });
    return this.getSchedule(id);
  }

  async updateSchedule(
    id: string,
    patch: Partial<Omit<InferInsertModel<typeof schedules>, "id">>
  ): Promise<Schedule> {
    await this.db
        .update(schedules)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schedules.id, id));
    return this.getSchedule(id);
  }

  async getSchedule(id: string): Promise<Schedule> {
    const schedule = this.db.select().from(schedules).where(eq(schedules.id, id)).get();
    if (!schedule) {
      throw new Error(`Schedule not found: ${id}`);
    }
    return schedule;
  }

  async listSchedules(activeOnly = false): Promise<Schedule[]> {
    const selection = this.db.select().from(schedules);
    if (activeOnly) {
      return selection.where(eq(schedules.active, true)).all();
    }
    return selection.all();
  }

  async setProviderConfig(provider: string, config: Record<string, unknown>): Promise<void> {
    const key = await getEncryptionKey();
    const encrypted = encrypt(JSON.stringify(config), key);
    const existing = await this.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.provider, provider));
    if (existing.length) {
      await this.db
        .update(providerConfigs)
        .set({ encryptedConfig: encrypted, updatedAt: new Date() })
        .where(eq(providerConfigs.provider, provider));
    } else {
      await this.db
        .insert(providerConfigs)
        .values({ id: createId(), provider, encryptedConfig: encrypted });
    }
  }

  async getProviderConfig(provider: string): Promise<Record<string, unknown> | null> {
    const record = this.db
      .select()
      .from(providerConfigs)
      .where(eq(providerConfigs.provider, provider))
      .get();
    if (!record) return null;
    const key = await getEncryptionKey();
    const decrypted = decrypt(record.encryptedConfig, key);
    return JSON.parse(decrypted);
  }

  async listProviderConfigs(provider?: string): Promise<ProviderConfigEntry[]> {
    const query = this.db.select().from(providerConfigs);
    const rows = provider
      ? query.where(eq(providerConfigs.provider, provider)).all()
      : query.all();
    const key = await getEncryptionKey();
    return rows.map((row) => ({
      provider: row.provider,
      config: JSON.parse(decrypt(row.encryptedConfig, key))
    }));
  }

  async logSession(summary: string): Promise<void> {
    await this.db.insert(sessions).values({ id: createId(), summary });
  }
}
