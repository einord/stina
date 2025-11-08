import Database from 'better-sqlite3';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ChatMessage } from './types/chat.js';
import type { TodoInput, TodoItem, TodoStatus, TodoUpdate } from './types/todo.js';

type MessageRow = {
  id: string;
  role: ChatMessage['role'];
  content: string;
  ts: number;
  aborted?: number | null;
};

type TodoRow = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  dueTs?: number | null;
  metadata?: string | null;
  source?: string | null;
  createdAt: number;
  updatedAt: number;
};

type BetterSqlite3Database = InstanceType<typeof Database>;

const DB_DIR = path.join(os.homedir(), '.stina');
const DB_FILE = path.join(DB_DIR, 'stina.db');
const COUNTER_KEY = 'counter';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function serializeMetadata(meta?: Record<string, unknown> | null) {
  if (!meta) return null;
  try {
    return JSON.stringify(meta);
  } catch {
    return null;
  }
}

function deserializeMetadata(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

class Store extends EventEmitter {
  private db: BetterSqlite3Database;
  private messages: ChatMessage[] = [];
  private lastMessagesHash = '[]';
  private count = 0;
  private lastTodosHash = '[]';
  private watchHandle: fs.FSWatcher | null = null;
  private pendingReload: NodeJS.Timeout | null = null;

  constructor() {
    super();
    ensureDir(DB_DIR);
    this.db = new Database(DB_FILE);
    this.db.pragma('journal_mode = WAL');
    this.bootstrap();
  }

  private bootstrap() {
    this.initSchema();
    this.messages = this.readAllMessages();
    this.lastMessagesHash = JSON.stringify(this.messages);
    this.count = this.readCounter();
    this.lastTodosHash = JSON.stringify(this.readAllTodos());
    this.setupWatch();
  }

  private initSchema() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        ts INTEGER NOT NULL,
        aborted INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        due_ts INTEGER,
        metadata TEXT,
        source TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
      CREATE INDEX IF NOT EXISTS idx_todos_due ON todos(due_ts);
    `);
  }

  private setupWatch() {
    if (this.watchHandle) return;
    try {
      this.watchHandle = fs.watch(DB_FILE, { persistent: false }, () => {
        if (this.pendingReload) return;
        this.pendingReload = setTimeout(() => {
          this.pendingReload = null;
          this.reloadSnapshots();
        }, 60);
      });
    } catch {
      this.watchHandle = null;
    }
  }

  private reloadSnapshots() {
    this.refreshMessages();
    this.refreshCounter();
    this.refreshTodos();
  }

  private refreshMessages() {
    const next = this.readAllMessages();
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastMessagesHash) return;
    this.messages = next;
    this.lastMessagesHash = nextHash;
    this.emit('messages', this.messages);
  }

  private refreshCounter() {
    const next = this.readCounter();
    if (next === this.count) return;
    this.count = next;
    this.emit('change', this.count);
  }

  private refreshTodos() {
    const next = this.readAllTodos();
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastTodosHash) return;
    this.lastTodosHash = nextHash;
    this.emit('todos', next);
  }

  private emitTodos() {
    const snapshot = this.listTodos();
    this.lastTodosHash = JSON.stringify(snapshot);
    this.emit('todos', snapshot);
  }

  private readAllMessages(): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT id, role, content, ts, aborted FROM chat_messages ORDER BY ts ASC')
      .all() as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      ts: Number(row.ts) || 0,
      aborted: row.aborted ? true : undefined,
    }));
  }

  private readCounter(): number {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(COUNTER_KEY) as
      | { value: string }
      | undefined;
    if (!row) return 0;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private writeCounter(value: number) {
    this.db
      .prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(COUNTER_KEY, String(value));
  }

  private readAllTodos(): TodoItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, description, status, due_ts AS dueTs, metadata, source, created_at AS createdAt, updated_at AS updatedAt
         FROM todos
         ORDER BY CASE WHEN due_ts IS NULL THEN 1 ELSE 0 END, due_ts ASC, created_at ASC`,
      )
      .all() as TodoRow[];
    return rows.map(normalizeTodoRow);
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  async appendMessage(
    msg: Omit<ChatMessage, 'id' | 'ts'> & Partial<Pick<ChatMessage, 'id' | 'ts'>>,
  ): Promise<ChatMessage> {
    const record: ChatMessage = {
      id: msg.id ?? uid(),
      ts: msg.ts ?? Date.now(),
      role: msg.role,
      content: msg.content,
      aborted: msg.aborted ? true : undefined,
    };
    this.db
      .prepare(
        'INSERT INTO chat_messages (id, role, content, ts, aborted) VALUES (@id, @role, @content, @ts, @aborted)',
      )
      .run({ ...record, aborted: record.aborted ? 1 : 0 });
    this.messages.push(record);
    this.lastMessagesHash = JSON.stringify(this.messages);
    this.emit('messages', this.getMessages());
    return record;
  }

  async clearMessages() {
    this.db.prepare('DELETE FROM chat_messages').run();
    this.messages = [];
    this.lastMessagesHash = '[]';
    this.emit('messages', this.messages);
  }

  subscribe(listener: (count: number) => void): () => void {
    this.on('change', listener);
    queueMicrotask(() => listener(this.count));
    return () => this.off('change', listener);
  }

  getCount(): number {
    return this.count;
  }

  async increment(by = 1): Promise<number> {
    this.count += by;
    this.writeCounter(this.count);
    this.emit('change', this.count);
    return this.count;
  }

  onMessages(listener: (messages: ChatMessage[]) => void): () => void {
    this.on('messages', listener);
    queueMicrotask(() => listener(this.getMessages()));
    return () => this.off('messages', listener);
  }

  // Todo helpers
  listTodos(filter?: { status?: TodoStatus; limit?: number }): TodoItem[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter?.status) {
      clauses.push('status = @status');
      params.status = filter.status;
    }
    let sql =
      'SELECT id, title, description, status, due_ts AS dueTs, metadata, source, created_at AS createdAt, updated_at AS updatedAt FROM todos';
    if (clauses.length > 0) {
      sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY CASE WHEN due_ts IS NULL THEN 1 ELSE 0 END, due_ts ASC, created_at ASC';
    if (filter?.limit) {
      sql += ' LIMIT @limit';
      params.limit = filter.limit;
    }
    return (this.db.prepare(sql).all(params) as TodoRow[]).map(normalizeTodoRow);
  }

  async createTodo(input: TodoInput & { status?: TodoStatus }): Promise<TodoItem> {
    const now = Date.now();
    const title = input.title?.trim();
    if (!title) {
      throw new Error('Todo title is required');
    }
    const item: TodoItem = {
      id: uid(),
      title,
      description: input.description?.trim() || undefined,
      status: input.status ?? 'pending',
      dueAt: typeof input.dueAt === 'number' ? input.dueAt : null,
      metadata: input.metadata ?? null,
      source: input.source ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO todos (id, title, description, status, due_ts, metadata, source, created_at, updated_at)
         VALUES (@id, @title, @description, @status, @due_ts, @metadata, @source, @created_at, @updated_at)`,
      )
      .run({
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        status: item.status,
        due_ts: item.dueAt ?? null,
        metadata: serializeMetadata(item.metadata ?? null),
        source: item.source ?? null,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    this.emitTodos();
    return item;
  }

  async updateTodo(id: string, patch: TodoUpdate): Promise<TodoItem | null> {
    const existing = this.db
      .prepare(
        'SELECT id, title, description, status, due_ts AS dueTs, metadata, source, created_at AS createdAt, updated_at AS updatedAt FROM todos WHERE id = ?',
      )
      .get(id) as TodoRow | undefined;
    if (!existing) return null;
    const current = normalizeTodoRow(existing);
    const next: TodoItem = {
      ...current,
      ...patch,
      title: patch.title?.trim() ?? current.title,
      description: patch.description?.trim() ?? current.description,
      dueAt: patch.dueAt === undefined ? current.dueAt : patch.dueAt,
      metadata: patch.metadata === undefined ? current.metadata : patch.metadata,
      source: patch.source === undefined ? current.source : patch.source,
      status: patch.status ?? current.status,
      updatedAt: Date.now(),
    };
    this.db
      .prepare(
        `UPDATE todos
         SET title=@title,
             description=@description,
             status=@status,
             due_ts=@due_ts,
             metadata=@metadata,
             source=@source,
             updated_at=@updated_at
         WHERE id=@id`,
      )
      .run({
        id: next.id,
        title: next.title,
        description: next.description ?? null,
        status: next.status,
        due_ts: next.dueAt ?? null,
        metadata: serializeMetadata(next.metadata ?? null),
        source: next.source ?? null,
        updated_at: next.updatedAt,
      });
    this.emitTodos();
    return next;
  }

  async deleteTodo(id: string): Promise<boolean> {
    const info = this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    if (info.changes > 0) {
      this.emitTodos();
      return true;
    }
    return false;
  }

  onTodos(listener: (todos: TodoItem[]) => void): () => void {
    this.on('todos', listener);
    queueMicrotask(() => listener(this.listTodos()));
    return () => this.off('todos', listener);
  }

  async appendAutomationMessage(tool: string | undefined, message: string): Promise<ChatMessage> {
    const trimmed = message?.trim();
    if (!trimmed) {
      throw new Error('automation message cannot be empty');
    }
    const prefix = tool?.trim()
      ? `Automatiserat meddelande från ${tool.trim()}:`
      : 'Automatiserat meddelande:';
    return this.appendMessage({ role: 'info', content: `${prefix} ${trimmed}` });
  }
}

function normalizeTodoRow(row: TodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status === 'completed' ? 'completed' : 'pending',
    dueAt: row.dueTs == null ? null : Number(row.dueTs),
    metadata: deserializeMetadata(row.metadata ?? null),
    source: row.source ?? null,
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

const store = new Store();
export default store;
export type { ChatMessage, ChatRole } from './types/chat.js';
export type { TodoInput, TodoItem, TodoStatus, TodoUpdate } from './types/todo.js';
