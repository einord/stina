import { asc, desc, eq, inArray, sql } from 'drizzle-orm';

import store from '@stina/store/index_new';

import { chatTables, conversationsTable, interactionMessagesTable, interactionsTable } from './schema.js';
import { ChatEvent, ChatRole, ChatSnapshot, Interaction, InteractionMessage, NewInteractionMessage } from './types.js';

const MODULE_NAME = 'chat';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Repository responsible for chat persistence and change notifications.
 * Provides high-level helpers to create conversations, interactions, and messages.
 */
export class ChatRepository {
  private interactionContext: string[] = [];

  constructor(
    private readonly db: ReturnType<typeof store.getDatabase>,
    private readonly emitChange: (payload: ChatEvent) => void,
  ) {}

  /** Returns the currently active conversation id, creating one if missing. */
  async getCurrentConversationId(): Promise<string> {
    const conversation = await this.ensureConversation();
    return conversation.id;
  }

  /** Starts a new active conversation and returns its id. */
  async startNewConversation(title?: string): Promise<string> {
    const id = `c_${uid()}`;
    const now = new Date();
    // Run sequentially (Better-SQLite3 transactions are synchronous).
    await this.db.update(conversationsTable).set({ active: false }).where(eq(conversationsTable.active, true));
    await this.db.insert(conversationsTable).values({
      id,
      title,
      createdAt: now,
      updatedAt: now,
      active: true,
    });
    this.emitChange({ kind: 'conversation', id });
    return id;
  }

  /** Retrieves a snapshot of the active or specified conversation with interactions/messages. */
  async getSnapshot(conversationId?: string): Promise<ChatSnapshot | null> {
    const conversation = await this.ensureConversation(conversationId);
    if (!conversation) return null;
    const interactions = await this.db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.conversationId, conversation.id))
      .orderBy(asc(interactionsTable.createdAt));

    if (!interactions.length) {
      return { conversation, interactions: [] };
    }

    const messageRows = await this.db
      .select()
      .from(interactionMessagesTable)
      .where(eq(interactionMessagesTable.conversationId, conversation.id))
      .orderBy(asc(interactionMessagesTable.ts));

    const grouped = new Map<string, InteractionMessage[]>();
    for (const row of messageRows) {
      const list = grouped.get(row.interactionId) ?? [];
      list.push({ ...row, content: row.content });
      grouped.set(row.interactionId, list);
    }

    const hydrated: Interaction[] = interactions.map((interaction) => ({
      ...interaction,
      messages: grouped.get(interaction.id)?.slice() ?? [],
    }));

    return { conversation, interactions: hydrated };
  }

  /** Returns all interactions for a conversation or the active one if omitted. */
  async getInteractions(conversationId?: string): Promise<Interaction[]> {
    const snapshot = await this.getSnapshot(conversationId);
    return snapshot?.interactions ?? [];
  }

  /** Returns paginated interactions ordered by newest first. */
  async getInteractionsPage(limit: number, offset: number): Promise<Interaction[]> {
    const interactionRows = await this.db
      .select()
      .from(interactionsTable)
      .orderBy(desc(interactionsTable.createdAt))
      .limit(limit)
      .offset(offset);

    if (!interactionRows.length) return [];

    const interactionIds = interactionRows.map((row) => row.id);
    const messageRows = await this.db
      .select()
      .from(interactionMessagesTable)
      .where(inArray(interactionMessagesTable.interactionId, interactionIds))
      .orderBy(asc(interactionMessagesTable.ts));

    const grouped = new Map<string, InteractionMessage[]>();
    for (const row of messageRows) {
      const list = grouped.get(row.interactionId) ?? [];
      list.push({ ...row, content: row.content });
      grouped.set(row.interactionId, list);
    }

    return interactionRows.map((interaction) => ({
      ...interaction,
      messages: grouped.get(interaction.id)?.slice() ?? [],
    }));
  }

  /** Returns a flattened, time-sorted list of messages for the supplied conversation. */
  async getFlattenedHistory(conversationId?: string): Promise<InteractionMessage[]> {
    const snapshot = await this.getSnapshot(conversationId);
    if (!snapshot) return [];
    return snapshot.interactions
      .flatMap((interaction) =>
        interaction.messages.map((message) => ({
          ...message,
          aborted: interaction.aborted || message.aborted,
        })),
      )
      .sort((a, b) => Number(a.ts) - Number(b.ts));
  }

  /** Returns flattened messages for a conversation. */
  async getMessagesForConversation(conversationId: string): Promise<InteractionMessage[]> {
    return this.getFlattenedHistory(conversationId);
  }

  /** Returns paginated messages (flattened) for a conversation. */
  async getMessagesPage(
    params: { conversationId?: string; limit?: number; offset?: number } = {},
  ): Promise<InteractionMessage[]> {
    const snapshot = await this.getSnapshot(params.conversationId);
    if (!snapshot) return [];
    const all = await this.getFlattenedHistory(snapshot.conversation.id);
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 50;
    return all.slice(offset, offset + limit);
  }

  /** Returns count of messages for a conversation. */
  async countMessages(conversationId?: string): Promise<number> {
    const snapshot = await this.getSnapshot(conversationId);
    if (!snapshot) return 0;
    return snapshot.interactions.reduce((sum, interaction) => sum + interaction.messages.length, 0);
  }

  /** Returns total count of messages across all conversations. */
  async countAllMessages(): Promise<number> {
    const row = await this.db
      .select({ value: sql<number>`count(*)` })
      .from(interactionMessagesTable)
      .limit(1);
    return Number(row[0]?.value ?? 0);
  }

  /**
   * Appends a message, creating interaction if needed. Returns the persisted row.
   */
  async appendMessage(params: {
    role: ChatRole;
    content: string;
    conversationId?: string;
    interactionId?: string;
    provider?: string;
    aborted?: boolean;
  }): Promise<InteractionMessage> {
    const conversation = await this.ensureConversation(params.conversationId);
    if (!conversation) throw new Error('No conversation available');

    const now = new Date();
    const interactionId = params.interactionId ?? this.currentInteractionContext() ?? `ia_${uid()}`;

    const existingInteraction = await this.db
      .select()
      .from(interactionsTable)
      .where(eq(interactionsTable.id, interactionId))
      .limit(1);

    if (!existingInteraction.length) {
      await this.db.insert(interactionsTable).values({
        id: interactionId,
        conversationId: conversation.id,
        createdAt: now,
        aborted: params.aborted ?? false,
        provider: params.provider,
        aiModel: undefined,
      });
    } else if (params.aborted && !existingInteraction[0]?.aborted) {
      await this.db
        .update(interactionsTable)
        .set({ aborted: true })
        .where(eq(interactionsTable.id, interactionId));
    }

    const record: NewInteractionMessage = {
      id: `m_${uid()}`,
      interactionId,
      conversationId: conversation.id,
      role: params.role,
      content: params.content,
      ts: now,
      provider: params.provider,
      aborted: params.aborted ?? false,
    };

    await this.db.insert(interactionMessagesTable).values(record);

    await this.db
      .update(conversationsTable)
      .set({ updatedAt: now })
      .where(eq(conversationsTable.id, conversation.id));

    this.emitChange({ kind: 'message', conversationId: conversation.id, interactionId });

    return { ...record, content: record.content };
  }

  /** Appends a user message. */
  async appendUserMessage(content: string) {
    return this.appendMessage({ role: 'user', content });
  }

  /** Appends an assistant message. */
  async appendAssistantMessage(
    content: string,
    options?: { interactionId?: string; conversationId?: string },
  ) {
    return this.appendMessage({
      role: 'assistant',
      content,
      interactionId: options?.interactionId,
      conversationId: options?.conversationId,
    });
  }

  /** Appends a tool message. */
  async appendToolMessage(
    content: string,
    options?: { interactionId?: string; conversationId?: string },
  ) {
    return this.appendMessage({
      role: 'tool',
      content,
      interactionId: options?.interactionId,
      conversationId: options?.conversationId,
    });
  }

  /** Appends an error message. */
  async appendErrorMessage(content: string, options?: { interactionId?: string; conversationId?: string }) {
    return this.appendMessage({
      role: 'error',
      content,
      interactionId: options?.interactionId,
      conversationId: options?.conversationId,
      aborted: false,
    });
  }

  /** Appends an info message for the current conversation. */
  async appendInfoMessage(content: string) {
    return this.appendMessage({
      role: 'info',
      content,
    });
  }

  /** Appends an instruction message for the current conversation. */
  async appendInstructionMessage(content: string) {
    return this.appendMessage({
      role: 'instructions',
      content,
    });
  }

  /** Executes a callback with a temporary interaction context. */
  async withInteractionContext<T>(interactionId: string, fn: () => Promise<T>): Promise<T> {
    if (!interactionId) return fn();
    this.interactionContext.push(interactionId);
    try {
      return await fn();
    } finally {
      this.interactionContext.pop();
    }
  }

  /** Subscribes to chat change events. */
  onChange(listener: (payload: ChatEvent) => void) {
    return store.onChange(MODULE_NAME, listener);
  }

  /** Subscribes to snapshots for the active conversation. */
  onSnapshot(listener: (snapshot: ChatSnapshot | null) => void) {
    const unsubscribe = store.onChange(MODULE_NAME, async () => {
      listener(await this.getSnapshot());
    });
    void this.getSnapshot().then(listener);
    return unsubscribe;
  }

  /** Subscribes to external-change events to refresh downstream caches. */
  watchExternalChanges() {
    return store.on('external-change', async () => {
      const snapshot = await this.getSnapshot();
      this.emitChange({ kind: 'snapshot' });
      void snapshot;
    });
  }

  /** Marks a conversation as active. */
  async setActiveConversation(conversationId: string) {
    const now = new Date();
    await this.db.update(conversationsTable).set({ active: false }).where(eq(conversationsTable.active, true));
    await this.db
      .update(conversationsTable)
      .set({ active: true, updatedAt: now })
      .where(eq(conversationsTable.id, conversationId));
    this.emitChange({ kind: 'conversation', id: conversationId });
  }

  private currentInteractionContext() {
    return this.interactionContext[this.interactionContext.length - 1];
  }

  private async ensureConversation(conversationId?: string) {
    if (conversationId) {
      const rows = await this.db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, conversationId))
        .limit(1);
      if (rows[0]) return rows[0];
    }

    const active = await this.db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.active, true))
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);
    if (active[0]) return active[0];

    // Fall back to latest conversation
    const latest = await this.db
      .select()
      .from(conversationsTable)
      .orderBy(desc(conversationsTable.updatedAt))
      .limit(1);
    if (latest[0]) return latest[0];

    const id = `c_${uid()}`;
    const now = new Date();
    await this.db.insert(conversationsTable).values({
      id,
      createdAt: now,
      updatedAt: now,
      active: true,
    });
    return (
      await this.db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.id, id))
        .limit(1)
    )[0];
  }
}

let chatRepositorySingleton: ChatRepository | null = null;

/**
 * Registers the chat module with the shared store and returns a singleton repository.
 */
export function getChatRepository(): ChatRepository {
  if (chatRepositorySingleton) return chatRepositorySingleton;

  // Drop any stale chat tables; safe since no user data to preserve yet.
  try {
    const rawDb = store.getRawDatabase();
    rawDb.exec(
      `DROP TABLE IF EXISTS chat_interaction_messages;
       DROP TABLE IF EXISTS chat_interactions;
       DROP TABLE IF EXISTS chat_conversations;`,
    );
  } catch (err) {
    console.warn('[chat] failed to drop legacy chat tables', err);
  }

  const { api } = store.registerModule({
    name: MODULE_NAME,
    schema: () => chatTables,
    bootstrap: ({ db, emitChange }) => new ChatRepository(db, emitChange),
  });

  chatRepositorySingleton = api ?? new ChatRepository(store.getDatabase(), () => undefined);
  return chatRepositorySingleton;
}

/**
 * Convenience helper to append a tool message with typed parameters.
 */
export function appendToolMessage(
  payload: string,
  options?: { interactionId?: string; conversationId?: string },
) {
  return getChatRepository().appendMessage({
    role: 'tool',
    content: payload,
    interactionId: options?.interactionId,
    conversationId: options?.conversationId,
  });
}
