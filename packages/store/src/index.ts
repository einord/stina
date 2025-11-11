import { EventEmitter } from 'node:events';
import fs from 'node:fs';

import type Database from 'better-sqlite3';

import { listMemories, setMemoryChangeListener } from './memories.js';
import { listTodoComments, listTodos, setTodoChangeListener } from './todos.js';
import { DB_FILE, getDatabase } from './toolkit.js';
import type { ChatMessage } from './types/chat.js';
import type { MemoryItem } from './types/memory.js';
import type { TodoComment, TodoItem } from './types/todo.js';

type MessageRow = {
  id: string;
  role: ChatMessage['role'];
  content: string;
  ts: number;
  aborted?: number | null;
};

type BetterSqlite3Database = Database.Database;
const COUNTER_KEY = 'counter';

/**
 * Generates a short random identifier for chat messages and todos.
 */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Serializes metadata payloads to JSON, swallowing errors to avoid crashing persistence.
 */
/**
 * Central persistence layer backed by SQLite, emitting events when data changes.
 */
class Store extends EventEmitter {
  private db: BetterSqlite3Database;
  private messages: ChatMessage[] = [];
  private lastMessagesHash = '[]';
  private todos: TodoItem[] = [];
  private lastTodosHash = '[]';
  private memories: MemoryItem[] = [];
  private lastMemoriesHash = '[]';
  private count = 0;
  private watchHandle: fs.FSWatcher | null = null;
  private pendingReload: NodeJS.Timeout | null = null;

  /**
   * Opens the SQLite database, ensures schemas exist, and loads initial snapshots.
   */
  constructor() {
    super();
    this.db = getDatabase();
    setTodoChangeListener(() => this.refreshTodos());
    setMemoryChangeListener(() => this.refreshMemories());
    this.bootstrap();
  }

  /**
   * Initializes in-memory caches and starts the filesystem watcher.
   */
  private bootstrap() {
    this.initSchema();
    this.messages = this.readAllMessages();
    this.lastMessagesHash = JSON.stringify(this.messages);
    this.todos = this.readAllTodos();
    this.lastTodosHash = JSON.stringify(this.todos);
    this.memories = this.readAllMemories();
    this.lastMemoriesHash = JSON.stringify(this.memories);
    this.count = this.readCounter();
    this.setupWatch();
  }

  /**
   * Creates database tables and indexes if they are missing.
   */
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
    `);
  }

  /**
   * Establishes a file watcher to reload snapshots when another process mutates the DB.
   */
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

  /**
   * Refreshes all cached data structures (messages, counter).
   */
  private reloadSnapshots() {
    this.refreshMessages();
    this.refreshTodos();
    this.refreshMemories();
    this.refreshCounter();
  }

  /**
   * Loads chat messages from disk and emits if anything changed.
   */
  private refreshMessages() {
    const next = this.readAllMessages();
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastMessagesHash) return;
    this.messages = next;
    this.lastMessagesHash = nextHash;
    this.emit('messages', this.messages);
  }

  /**
   * Loads todo items from disk and emits when the snapshot changes.
   */
  private refreshTodos() {
    const next = this.readAllTodos();
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastTodosHash) return;
    this.todos = next;
    this.lastTodosHash = nextHash;
    this.emit('todos', this.todos);
  }

  /**
   * Loads memory items from disk and emits when the snapshot changes.
   */
  private refreshMemories() {
    const next = this.readAllMemories();
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastMemoriesHash) return;
    this.memories = next;
    this.lastMemoriesHash = nextHash;
    this.emit('memories', this.memories);
  }

  /**
   * Updates the in-memory counter and notifies listeners when it changes.
   */
  private refreshCounter() {
    const next = this.readCounter();
    if (next === this.count) return;
    this.count = next;
    this.emit('change', this.count);
  }

  /**
   * Reads all todo rows ordered by due date for renderer snapshots.
   */
  private readAllTodos(): TodoItem[] {
    return listTodos();
  }

  /**
   * Reads all memory rows ordered by creation date for renderer snapshots.
   */
  private readAllMemories(): MemoryItem[] {
    return listMemories();
  }

  /**
   * Reads all chat messages directly from SQLite regardless of caches.
   */
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

  /**
   * Retrieves the persisted counter value, defaulting to 0 on missing rows.
   */
  private readCounter(): number {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(COUNTER_KEY) as
      | { value: string }
      | undefined;
    if (!row) return 0;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Upserts the counter value in the kv table.
   */
  private writeCounter(value: number) {
    this.db
      .prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(COUNTER_KEY, String(value));
  }

  /**
   * Returns a shallow copy of cached chat messages to prevent accidental mutation.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Returns a shallow copy of cached todo items.
   */
  getTodos(): TodoItem[] {
    return [...this.todos];
  }

  /**
   * Returns a shallow copy of cached memory items.
   */
  getMemories(): MemoryItem[] {
    return [...this.memories];
  }

  getTodoComments(todoId: string): TodoComment[] {
    return listTodoComments(todoId);
  }

  /**
   * Appends an info message to the message history. This is a convenience wrapper around appendMessage.
   * @param message The message to add to the message history.
   */
  async appendInfoMessage(message: string): Promise<ChatMessage> {
    return this.appendMessage({ role: 'info', content: message, ts: Date.now() });
  }

  /**
   * Appends an instruction message to the message history. This is a convenience wrapper around appendMessage.
   * @param message The message to add to the message history.
   */
  async appendInstructionMessage(message: string): Promise<ChatMessage> {
    return this.appendMessage({ role: 'instructions', content: message, ts: Date.now() });
  }

  /**
   * Appends a chat message to SQLite and updates caches + listeners.
   * @param msg Partial record representing the message to insert.
   */
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

  /**
   * Deletes every chat message and resets in-memory state.
   */
  async clearMessages() {
    this.db.prepare('DELETE FROM chat_messages').run();
    this.messages = [];
    this.lastMessagesHash = '[]';
    this.emit('messages', this.messages);
  }

  /**
   * Subscribes to the numeric counter, immediately invoking the listener with the latest value.
   */
  subscribe(listener: (count: number) => void): () => void {
    this.on('change', listener);
    queueMicrotask(() => listener(this.count));
    return () => this.off('change', listener);
  }

  /**
   * Returns the current value of the counter.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Increments the counter by the provided amount and persists it.
   * @param by How much to add (defaults to 1).
   */
  async increment(by = 1): Promise<number> {
    this.count += by;
    this.writeCounter(this.count);
    this.emit('change', this.count);
    return this.count;
  }

  /**
   * Subscribes to chat message updates, priming the listener with the latest snapshot.
   */
  onMessages(listener: (messages: ChatMessage[]) => void): () => void {
    this.on('messages', listener);
    queueMicrotask(() => listener(this.getMessages()));
    return () => this.off('messages', listener);
  }

  /**
   * Subscribes to todo updates, invoking the listener with the latest snapshot immediately.
   */
  onTodos(listener: (todos: TodoItem[]) => void): () => void {
    this.on('todos', listener);
    queueMicrotask(() => listener(this.getTodos()));
    return () => this.off('todos', listener);
  }

  /**
   * Subscribes to memory updates, invoking the listener with the latest snapshot immediately.
   */
  onMemories(listener: (memories: MemoryItem[]) => void): () => void {
    this.on('memories', listener);
    queueMicrotask(() => listener(this.getMemories()));
    return () => this.off('memories', listener);
  }

  /**
   * Writes an automated info message attributed to a given tool.
   * @param tool Optional tool name to include in the prefix.
   * @param message Content that should appear in the chat.
   */
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

const store = new Store();
export default store;
export type { ChatMessage, ChatRole } from './types/chat.js';
export type { MemoryInput, MemoryItem, MemoryUpdate } from './types/memory.js';
export type { TodoComment, TodoInput, TodoItem, TodoStatus, TodoUpdate } from './types/todo.js';
