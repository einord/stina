import { EventEmitter } from 'node:events';
import fs from 'node:fs';

import type Database from 'better-sqlite3';

import SQLiteDatabase from './database/index.js';
import { listMemories, setMemoryChangeListener } from './memories.js';
import { listTodoComments, listTodos, setTodoChangeListener } from './todos.js';
import { DB_FILE, getDatabase } from './toolkit.js';
import type { Interaction, InteractionMessage } from './types/chat.js';
import type { MemoryItem } from './types/memory.js';
import type { TodoComment, TodoItem } from './types/todo.js';

type InteractionRow = {
  id: string;
  conversation_id: string;
  ts: number;
  aborted: boolean;
};

type InteractionMessageRow = {
  id: string;
  interaction_id: string;
  conversation_id: string;
  role: InteractionMessage['role'];
  content: string;
  ts: number;
};

type MessageInput = Omit<InteractionMessage, 'id' | 'ts' | 'conversationId' | 'interactionId'> &
  Partial<Pick<InteractionMessage, 'id' | 'ts' | 'conversationId'>> & {
    interactionId?: string;
    aborted: boolean;
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
  private interactions: Interaction[] = [];
  private lastInteractionsHash = '[]';
  private todos: TodoItem[] = [];
  private lastTodosHash = '[]';
  private memories: MemoryItem[] = [];
  private lastMemoriesHash = '[]';
  private count = 0;
  private currentConversationId = '';
  private interactionContext: string[] = [];
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
    this.ensureInteractionSchema();
    const storedConversationId = this.readConversationId();
    this.interactions = this.readAllInteractions(storedConversationId ?? undefined);
    this.lastInteractionsHash = JSON.stringify(this.interactions);
    this.todos = this.readAllTodos();
    this.lastTodosHash = JSON.stringify(this.todos);
    this.memories = this.readAllMemories();
    this.lastMemoriesHash = JSON.stringify(this.memories);
    this.count = this.readCounter();
    const initialConversationId =
      storedConversationId ??
      this.interactions[this.interactions.length - 1]?.conversationId ??
      this.generateConversationId();
    this.setCurrentConversationId(initialConversationId, false);
    this.setupWatch();
  }

  /**
   * Creates database tables and indexes if they are missing.
   */
  private initSchema() {
    this.db.exec(`
      -- PRAGMA foreign_keys = ON;
      DROP TABLE IF EXISTS chat_messages;
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        aborted INTEGER NOT NULL CHECK (aborted IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS interaction_messages (
        id TEXT PRIMARY KEY,
        interaction_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        ts INTEGER NOT NULL,
        FOREIGN KEY (interaction_id) REFERENCES interactions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_interactions_conversation ON interactions(conversation_id, ts);
      CREATE INDEX IF NOT EXISTS idx_messages_interaction ON interaction_messages(interaction_id, ts);
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  /**
   * Ensures the interactions table has the latest columns even across app upgrades.
   */
  private ensureInteractionSchema() {
    const columns = this.db.prepare('PRAGMA table_info(interactions)').all() as Array<{
      name: string;
    }>;
    const hasAbortedColumn = columns.some((col) => col.name === 'aborted');
    if (!hasAbortedColumn) {
      this.db.exec('ALTER TABLE interactions ADD COLUMN aborted INTEGER DEFAULT 0');
    }

    const messageColumns = this.db
      .prepare('PRAGMA table_info(interaction_messages)')
      .all() as Array<{ name: string }>;
    const hasMessageAborted = messageColumns.some((col) => col.name === 'aborted');
    if (!hasMessageAborted) {
      this.db.exec('ALTER TABLE interaction_messages ADD COLUMN aborted INTEGER DEFAULT 0');
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
    this.refreshInteractions();
    this.refreshTodos();
    this.refreshMemories();
    this.refreshCounter();
    this.refreshConversationId();
  }

  /**
   * Loads interactions from disk and emits if anything changed.
   */
  private refreshInteractions() {
    const next = this.readAllInteractions(this.currentConversationId);
    const nextHash = JSON.stringify(next);
    if (nextHash === this.lastInteractionsHash) return;
    this.interactions = next;
    this.lastInteractionsHash = nextHash;
    this.emit('interactions', this.getInteractions());
    // this.emit('messages', this.getMessages());
    // this.emit('getLatestMessageTimeStamp', this.getLatestMessageTimeStamp());
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
   * Reads all interactions and their messages from SQLite regardless of caches.
   */
  private readAllInteractions(defaultConversationId?: string): Interaction[] {
    const fallback =
      defaultConversationId ?? this.currentConversationId ?? this.generateConversationId();
    const interactionRows = this.db
      .prepare('SELECT id, conversation_id, ts, aborted FROM interactions ORDER BY ts ASC')
      .all() as InteractionRow[];
    const messageRows = this.db
      .prepare(
        'SELECT id, interaction_id, conversation_id, role, content, ts, aborted FROM interaction_messages ORDER BY ts ASC',
      )
      .all() as InteractionMessageRow[];

    const grouped = new Map<string, Interaction>();

    for (const row of interactionRows) {
      grouped.set(row.id, {
        id: row.id,
        conversationId: row.conversation_id ?? fallback,
        ts: Number(row.ts) || 0,
        aborted: row.aborted,
        messages: [],
      });
    }

    for (const row of messageRows) {
      const parent = grouped.get(row.interaction_id);
      const conversationId = parent?.conversationId ?? row.conversation_id ?? fallback;
      const message: InteractionMessage = {
        id: row.id,
        interactionId: row.interaction_id,
        conversationId,
        role: row.role,
        content: row.content,
        ts: Number(row.ts) || 0,
      };
      if (parent) {
        parent.messages.push(message);
        parent.messages.sort((a, b) => a.ts - b.ts);
      } else {
        grouped.set(row.interaction_id, {
          id: row.interaction_id,
          conversationId,
          ts: message.ts,
          aborted: false,
          messages: [message],
        });
      }
    }

    return [...grouped.values()].sort((a, b) => a.ts - b.ts);
  }

  private currentInteractionContext(): string | undefined {
    return this.interactionContext[this.interactionContext.length - 1];
  }

  async withInteractionContext<T>(interactionId: string, fn: () => Promise<T>): Promise<T> {
    if (!interactionId) {
      return fn();
    }
    this.interactionContext.push(interactionId);
    try {
      return await fn();
    } finally {
      this.interactionContext.pop();
    }
  }

  /**
   * Merges a freshly persisted message into the in-memory interaction cache.
   */
  private insertMessageIntoCache(
    message: InteractionMessage,
    interactionTs: number,
    isNewInteraction: boolean,
    abortedInteraction: boolean,
  ) {
    let target = this.interactions.find((interaction) => interaction.id === message.interactionId);
    if (!target) {
      target = {
        id: message.interactionId,
        conversationId: message.conversationId,
        ts: interactionTs,
        aborted: abortedInteraction,
        messages: [],
      };
      this.interactions.push(target);
    } else if (isNewInteraction) {
      target.ts = interactionTs;
      target.conversationId = message.conversationId;
      target.messages = [];
    }
    if (abortedInteraction) {
      target.aborted = true;
    }
    target.messages.push(message);
    target.messages.sort((a, b) => a.ts - b.ts);
    this.interactions.sort((a, b) => a.ts - b.ts);
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

  // /**
  //  * Returns a flattened view of every interaction message for legacy consumers.
  //  */
  // getMessages(): ChatMessage[] {
  //   return this.buildMessageList();
  // }

  // /**
  //  * Gets the timestamp of the latest persisted message, or null if none exist.
  //  */
  // getLatestMessageTimeStamp(): number | null {
  //   const row = this.db
  //     .prepare('SELECT ts FROM interaction_messages ORDER BY ts DESC LIMIT 1')
  //     .get() as { ts: number } | undefined;
  //   if (!row) return null;
  //   return Number(row.ts) || null;
  // }

  /**
   * Retrieves paginated interactions (including their messages) ordered chronologically.
   */
  getMessagesPage(limit: number, offset: number): Interaction[] {
    const rows = this.db
      .prepare(
        'SELECT id, conversation_id, ts, aborted FROM interactions ORDER BY ts DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset) as InteractionRow[];
    if (!rows.length) return [];

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const messageRows = this.db
      .prepare(
        `SELECT id, interaction_id, conversation_id, role, content, ts
         FROM interaction_messages
         WHERE interaction_id IN (${placeholders})
         ORDER BY ts ASC`,
      )
      .all(...ids) as InteractionMessageRow[];

    const mapped = new Map<string, Interaction>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          conversationId: row.conversation_id,
          ts: Number(row.ts) || 0,
          aborted: row.aborted === true ? true : false,
          messages: [],
        },
      ]),
    );

    for (const msg of messageRows) {
      const target = mapped.get(msg.interaction_id);
      if (!target) continue;
      target.messages.push({
        id: msg.id,
        interactionId: msg.interaction_id,
        conversationId: msg.conversation_id,
        role: msg.role,
        content: msg.content,
        ts: Number(msg.ts) || 0,
      });
    }

    for (const interaction of mapped.values()) {
      interaction.messages.sort((a, b) => a.ts - b.ts);
    }

    console.log('mapped interactions:', mapped);

    return [...mapped.values()].sort((a, b) => a.ts - b.ts);
  }

  /**
   * Returns the number of persisted interaction messages.
   */
  getMessageCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM interaction_messages').get() as {
      count: number;
    };
    return row.count;
  }

  /**
   * Returns every interaction grouped by their messages.
   */
  getInteractions(): Interaction[] {
    return this.interactions.map((interaction) => ({
      ...interaction,
      messages: interaction.messages.map((msg) => ({ ...msg })),
    }));
  }

  /**
   * Returns interactions that belong to the supplied conversation id.
   */
  getInteractionsForConversation(conversationId: string): Interaction[] {
    if (!conversationId) {
      return this.getInteractions();
    }
    return this.interactions
      .filter((interaction) => interaction.conversationId === conversationId)
      .map((interaction) => ({
        ...interaction,
        messages: interaction.messages.map((msg) => ({ ...msg })),
      }));
  }

  /**
   * Produces a flattened snapshot of the supplied interactions (or all if omitted).
   */
  private buildMessageList(source?: Interaction[]): InteractionMessage[] {
    const base = source ?? this.interactions;
    return base
      .flatMap((interaction) =>
        interaction.messages.map((msg) => ({
          ...msg,
          aborted: interaction.aborted ?? false,
        })),
      )
      .sort((a, b) => a.ts - b.ts)
      .map((msg) => ({ ...msg }));
  }

  /**
   * Returns messages belonging to the supplied conversation id as a flat list.
   */
  getMessagesForConversation(conversationId: string): InteractionMessage[] {
    return this.buildMessageList(
      this.interactions.filter((interaction) => interaction.conversationId === conversationId),
    );
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
  async appendInfoMessage(message: string): Promise<InteractionMessage> {
    return this.appendMessage({ role: 'info', content: message, ts: Date.now(), aborted: false });
  }

  /**
   * Appends an instruction message to the message history. This is a convenience wrapper around appendMessage.
   * @param message The message to add to the message history.
   */
  async appendInstructionMessage(message: string): Promise<InteractionMessage> {
    return this.appendMessage({
      role: 'instructions',
      content: message,
      ts: Date.now(),
      aborted: false,
    });
  }

  /**
   * Appends a chat message to SQLite and updates caches + listeners.
   * @param msg Partial record representing the message to insert.
   */
  async appendMessage(msg: MessageInput): Promise<InteractionMessage> {
    let conversationId = msg.conversationId ?? this.ensureConversationId();
    const ts = msg.ts ?? Date.now();
    const requestedInteractionId = msg.interactionId ?? this.currentInteractionContext();
    let interactionRow = requestedInteractionId
      ? (this.db
          .prepare('SELECT id, conversation_id, ts, aborted FROM interactions WHERE id = ?')
          .get(requestedInteractionId) as InteractionRow | undefined)
      : undefined;
    const isNewInteraction = !interactionRow;
    const abortedFlag = msg.aborted;
    if (!interactionRow) {
      const id = requestedInteractionId ?? `ia_${uid()}`;
      interactionRow = { id, conversation_id: conversationId, ts, aborted: abortedFlag };
      this.db
        .prepare('INSERT INTO interactions (id, conversation_id, ts, aborted) VALUES (?, ?, ?, ?)')
        .run(interactionRow.id, interactionRow.conversation_id, interactionRow.ts, abortedFlag);
    } else {
      conversationId = interactionRow.conversation_id;
      if (abortedFlag && !interactionRow.aborted) {
        this.db.prepare('UPDATE interactions SET aborted = 1 WHERE id = ?').run(interactionRow.id);
        interactionRow.aborted = abortedFlag;
      }
    }
    const interactionId = interactionRow.id;
    const interactionTimestamp = Number(interactionRow.ts) || ts;

    const record: InteractionMessage = {
      id: msg.id ?? uid(),
      interactionId,
      conversationId,
      role: msg.role,
      content: msg.content,
      ts,
    };
    this.db
      .prepare(
        'INSERT INTO interaction_messages (id, interaction_id, conversation_id, role, content, ts, aborted) VALUES (@id, @interactionId, @conversationId, @role, @content, @ts, @aborted)',
      )
      .run({ ...record, aborted: abortedFlag });
    this.insertMessageIntoCache(
      record,
      interactionTimestamp,
      isNewInteraction,
      interactionRow.aborted,
    );
    this.lastInteractionsHash = JSON.stringify(this.interactions);
    this.emit('interactions', this.getInteractions());
    // this.emit('messages', this.getMessages());
    return record;
  }

  /**
   * Deletes every chat message and resets in-memory state.
   */
  async clearMessages() {
    this.db.prepare('DELETE FROM interaction_messages').run();
    this.db.prepare('DELETE FROM interactions').run();
    this.interactions = [];
    this.lastInteractionsHash = '[]';
    const nextId = this.generateConversationId();
    this.setCurrentConversationId(nextId);
    this.emit('interactions', []);
    this.emit('messages', []);
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

  // /**
  //  * Subscribes to chat message updates, priming the listener with the latest snapshot.
  //  */
  // onMessages(listener: (messages: ChatMessage[]) => void): () => void {
  //   this.on('messages', listener);
  //   queueMicrotask(() => listener(this.getMessages()));
  //   return () => this.off('messages', listener);
  // }

  /**
   * Subscribes to interaction updates for clients that need grouped messages.
   */
  onInteractions(listener: (interactions: Interaction[]) => void): () => void {
    this.on('interactions', listener);
    queueMicrotask(() => listener(this.getInteractions()));
    return () => this.off('interactions', listener);
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
  async appendAutomationMessage(
    tool: string | undefined,
    message: string,
  ): Promise<InteractionMessage> {
    const trimmed = message?.trim();
    if (!trimmed) {
      throw new Error('automation message cannot be empty');
    }
    const prefix = tool?.trim()
      ? `Automatiserat meddelande från ${tool.trim()}:`
      : 'Automatiserat meddelande:';
    return this.appendMessage({ role: 'info', content: `${prefix} ${trimmed}`, aborted: false });
  }
}

const store = new Store();
export default store;
export type { ChatMessage, ChatRole, Interaction, InteractionMessage } from './types/chat.js';
export type { MemoryInput, MemoryItem, MemoryUpdate } from './types/memory.js';
export type { TodoComment, TodoInput, TodoItem, TodoStatus, TodoUpdate } from './types/todo.js';

// Create new database instance and export it
const sqliteDatabase = new SQLiteDatabase();
export { sqliteDatabase };
