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
  conversation_id?: string | null;
};

type BetterSqlite3Database = Database.Database;
const COUNTER_KEY = 'counter';
const CONVERSATION_KEY = 'conversation_id';

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
  private currentConversationId = '';
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
    this.ensureConversationTracking();
    const storedConversationId = this.readConversationId();
    this.messages = this.readAllMessages(storedConversationId ?? undefined);
    this.lastMessagesHash = JSON.stringify(this.messages);
    this.todos = this.readAllTodos();
    this.lastTodosHash = JSON.stringify(this.todos);
    this.memories = this.readAllMemories();
    this.lastMemoriesHash = JSON.stringify(this.memories);
    this.count = this.readCounter();
    const initialConversationId =
      storedConversationId ??
      this.messages[this.messages.length - 1]?.conversationId ??
      this.generateConversationId();
    this.setCurrentConversationId(initialConversationId, false);
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
   * Ensures the chat_messages table tracks conversation ids and backfills historic rows.
   */
  private ensureConversationTracking() {
    const columns = this.db
      .prepare('PRAGMA table_info(chat_messages)')
      .all() as Array<{ name: string }>;
    const hasConversationColumn = columns.some((col) => col.name === 'conversation_id');
    if (!hasConversationColumn) {
      this.db.exec('ALTER TABLE chat_messages ADD COLUMN conversation_id TEXT');
    }

    const missing = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM chat_messages WHERE conversation_id IS NULL OR conversation_id = ''",
      )
      .get() as { count: number };
    if (missing.count > 0) {
      const fallback = this.generateConversationId();
      this.db
        .prepare(
          "UPDATE chat_messages SET conversation_id = ? WHERE conversation_id IS NULL OR conversation_id = ''",
        )
        .run(fallback);
      if (!this.readConversationId()) {
        this.writeConversationId(fallback);
      }
    }
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
    this.refreshConversationId();
  }

  /**
   * Loads chat messages from disk and emits if anything changed.
   */
  private refreshMessages() {
    const next = this.readAllMessages(this.currentConversationId);
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
   * Refreshes the cached conversation id when another process switches sessions.
   */
  private refreshConversationId() {
    const next = this.readConversationId();
    if (!next || next === this.currentConversationId) return;
    this.currentConversationId = next;
    this.emit('conversation', this.currentConversationId);
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
  private readAllMessages(defaultConversationId?: string): ChatMessage[] {
    const fallback = defaultConversationId ?? this.currentConversationId ?? this.generateConversationId();
    const rows = this.db
      .prepare(
        'SELECT id, role, content, ts, aborted, conversation_id FROM chat_messages ORDER BY ts ASC',
      )
      .all() as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      ts: Number(row.ts) || 0,
      aborted: row.aborted ? true : undefined,
      conversationId: row.conversation_id ?? fallback,
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
   * Reads the active conversation id from the kv table.
   */
  private readConversationId(): string | null {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(CONVERSATION_KEY) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  /**
   * Persists the active conversation id to the kv table.
   */
  private writeConversationId(value: string) {
    this.db
      .prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(CONVERSATION_KEY, value);
  }

  /**
   * Generates a globally unique-ish conversation id.
   */
  private generateConversationId(): string {
    return `conv_${Date.now().toString(36)}_${uid()}`;
  }

  /**
   * Ensures currentConversationId is set and optionally notifies listeners.
   */
  private setCurrentConversationId(id: string, emit = true) {
    if (!id) return;
    this.currentConversationId = id;
    this.writeConversationId(id);
    if (emit) {
      this.emit('conversation', id);
    }
  }

  /**
   * Returns a valid conversation id, hydrating from persistence if necessary.
   */
  private ensureConversationId(): string {
    if (this.currentConversationId) return this.currentConversationId;
    const stored = this.readConversationId();
    if (stored) {
      this.currentConversationId = stored;
      return stored;
    }
    const next = this.generateConversationId();
    this.setCurrentConversationId(next, false);
    return next;
  }

  /**
   * Returns a shallow copy of cached chat messages to prevent accidental mutation.
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Retrieves a paginated slice of chat messages in reverse chronological order.
   * Used for lazy-loading older messages in the UI.
   * @param limit Maximum number of messages to return
   * @param offset Number of messages to skip from the end
   * @returns Array of messages ordered from oldest to newest
   */
  getMessagesPage(limit: number, offset: number): ChatMessage[] {
    const rows = this.db
      .prepare(
        'SELECT id, role, content, ts, aborted, conversation_id FROM chat_messages ORDER BY ts DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset) as MessageRow[];
    // Reverse to maintain chronological order (oldest first)
    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      ts: Number(row.ts) || 0,
      aborted: row.aborted ? true : undefined,
      conversationId: row.conversation_id ?? this.ensureConversationId(),
    }));
  }

  /**
   * Returns the total number of chat messages in the database.
   */
  getMessageCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM chat_messages').get() as {
      count: number;
    };
    return row.count;
  }

  /**
   * Returns messages belonging to the supplied conversation id.
   */
  getMessagesForConversation(conversationId: string): ChatMessage[] {
    if (!conversationId) return this.getMessages();
    return this.messages.filter((m) => m.conversationId === conversationId);
  }

  /**
   * Returns the currently active conversation id, initializing it if missing.
   */
  getCurrentConversationId(): string {
    return this.ensureConversationId();
  }

  /**
   * Starts a brand new conversation, persisting and broadcasting the id.
   */
  startNewConversation(): string {
    const nextId = this.generateConversationId();
    this.setCurrentConversationId(nextId);
    return nextId;
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
    msg: Omit<ChatMessage, 'id' | 'ts' | 'conversationId'> &
      Partial<Pick<ChatMessage, 'id' | 'ts' | 'conversationId'>>,
  ): Promise<ChatMessage> {
    const conversationId = msg.conversationId ?? this.ensureConversationId();
    const record: ChatMessage = {
      id: msg.id ?? uid(),
      ts: msg.ts ?? Date.now(),
      role: msg.role,
      content: msg.content,
      aborted: msg.aborted ? true : undefined,
      conversationId,
    };
    this.db
      .prepare(
        'INSERT INTO chat_messages (id, role, content, ts, aborted, conversation_id) VALUES (@id, @role, @content, @ts, @aborted, @conversationId)',
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
    const nextId = this.generateConversationId();
    this.setCurrentConversationId(nextId);
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
   * Subscribes to conversation id changes so UIs can highlight the active session.
   */
  onConversationChange(listener: (conversationId: string) => void): () => void {
    this.on('conversation', listener);
    queueMicrotask(() => listener(this.getCurrentConversationId()));
    return () => this.off('conversation', listener);
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
