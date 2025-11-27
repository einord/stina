import { EventEmitter } from 'node:events';

import { t } from '@stina/i18n';

import { getChatRepository } from './repository.js';
import { Interaction, InteractionMessage } from './types.js';

export type StreamEvent = {
  id: string;
  interactionId?: string;
  start?: boolean;
  delta?: string;
  done?: boolean;
  aborted?: boolean;
};

export type Provider = {
  name: string;
  send(prompt: string, history: InteractionMessage[]): Promise<string>;
  sendStream?: (
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<string>;
};

export type ChatManagerOptions = {
  /** Resolves the active provider (injected from core). */
  resolveProvider: () => Promise<Provider | null>;
  /** Optional hook to refresh tool cache before a session starts. */
  refreshToolCache?: () => Promise<void>;
  /** Optional warning subscription hook for provider/tool warnings. */
  subscribeWarnings?: (listener: (event: unknown) => void) => () => void;
  /** Optional generator for the initial session prompt. */
  generateSessionPrompt?: () => Promise<string>;
  /** Optional hook to augment history with synthetic system/policy messages before sending. */
  prepareHistory?: (
    history: InteractionMessage[],
    context: { conversationId: string; providerName?: string },
  ) => Promise<InteractionMessage[] | { history: InteractionMessage[]; debugContent?: string }>;
};

/**
 * Central chat coordinator that streams between the chat repository and active provider.
 * A provider resolver and tool cache refresher are injected to keep this module independent of core.
 */
export class ChatManager extends EventEmitter {
  private controllers = new Map<string, AbortController>();
  private lastNewSessionAt = 0;
  private warnings: unknown[] = [];
  private unsubscribeWarning: (() => void) | null = null;
  private debugMode = false;
  private readonly repo = getChatRepository();

  constructor(private readonly options: Partial<ChatManagerOptions> = {}) {
    super();
  }

  /** Enables verbose debug messages. */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /** Returns cached warnings collected from provider layer. */
  getWarnings(): unknown[] {
    return [...this.warnings];
  }

  /** Subscribes to warning notifications. */
  onWarning(listener: (event: unknown) => void): () => void {
    this.on('warning', listener);
    return () => this.off('warning', listener);
  }

  /** Subscribes to interaction updates via the repository change bus. */
  onInteractions(listener: (interactions: Interaction[]) => void): () => void {
    const unsubscribe = this.repo.onChange(async () => {
      listener(await this.repo.getInteractions());
    });
    void this.repo.getInteractions().then(listener);
    return unsubscribe;
  }

  /** Subscribes to active conversation id changes. */
  onConversationChanged(listener: (conversationId: string) => void): () => void {
    const unsubscribe = this.repo.onChange(async (event) => {
      if (event?.kind === 'conversation') {
        listener(event.id);
      }
    });
    void this.repo.getCurrentConversationId().then(listener).catch(() => undefined);
    return unsubscribe;
  }

  /** Returns current interactions snapshot. */
  async getInteractions(): Promise<Interaction[]> {
    return this.repo.getInteractions();
  }

  /** Returns a paginated list of interactions ordered by newest first. */
  async getInteractionsPage(limit: number, offset: number): Promise<Interaction[]> {
    return this.repo.getInteractionsPage(limit, offset);
  }

  /** Returns total message count across conversations. */
  async getMessageCount(): Promise<number> {
    return this.repo.countAllMessages();
  }

  /** Returns the active conversation id. */
  async getCurrentConversationId(): Promise<string> {
    return this.repo.getCurrentConversationId();
  }

  /** Clears all history except the currently active conversation. */
  async clearHistoryExceptActive(): Promise<void> {
    return this.repo.clearHistoryExceptActive();
  }

  /** Registers a listener for delta stream events emitted during assistant generation. */
  onStream(listener: (event: StreamEvent) => void): () => void {
    this.on('stream', listener);
    return () => this.off('stream', listener);
  }

  /** Emits a stream event to listeners. */
  private emitStream(event: StreamEvent) {
    this.emit('stream', event);
  }

  /**
   * Inserts an info message indicating a new session start, debounced to avoid spam.
   */
  async newSession(label?: string): Promise<Interaction[]> {
    const now = Date.now();
    if (now - this.lastNewSessionAt < 400) {
      return this.repo.getInteractions();
    }
    this.lastNewSessionAt = now;

    await this.repo.startNewConversation();

    if (this.options.refreshToolCache) {
      await this.options.refreshToolCache();
    }

    const sessionLabel = label?.trim() ? label : t('chat.new_session');
    await this.repo.appendInfoMessage(sessionLabel);

    if (this.options.generateSessionPrompt) {
      const firstMessage = await this.options.generateSessionPrompt();
      await this.sendMessage(firstMessage, 'instructions');
    }

    return this.repo.getInteractions();
  }

  /**
   * Appends a user message and streams assistant response from the active provider.
   */
  async sendMessage(text: string, role: InteractionMessage['role'] = 'user'): Promise<InteractionMessage> {
    if (!text.trim()) {
      throw new Error(t('errors.empty_message'));
    }

    const conversationId = await this.repo.getCurrentConversationId();
    const interactionId = `ia_${Math.random().toString(36).slice(2, 10)}`;

    await this.repo.appendMessage({
      role,
      content: text,
      conversationId,
      interactionId,
      aborted: false,
    });

    const assistantMessage = await this.repo.withInteractionContext(interactionId, async () => {
      const history = await this.repo.getMessagesForConversation(conversationId);
      const provider = await this.resolveProvider();

      if (this.debugMode && provider) {
        await this.repo.appendMessage({
          role: 'debug',
          content: text,
          conversationId,
          interactionId,
          provider: provider.name,
          aborted: false,
        });
      }

      if (!provider) {
        return this.repo.appendMessage({
          role: 'error',
          content: t('errors.no_provider'),
          conversationId,
          interactionId,
          aborted: false,
        });
      }

      const assistantId = `as_${Math.random().toString(36).slice(2, 10)}`;
      const controller = new AbortController();
      this.controllers.set(assistantId, controller);
      this.emitStream({ id: assistantId, interactionId, start: true });

      let total = '';
      const pushChunk = (delta: string) => {
        total += delta;
        if (delta) this.emitStream({ id: assistantId, interactionId, delta });
      };

      let replyText = '';
      let aborted = false;

      let effectiveHistory = history;
      let preparedDebug: string | undefined;
      if (this.options.prepareHistory) {
        const prepared = await this.options.prepareHistory(history, {
          conversationId,
          providerName: provider.name,
        });
        if (Array.isArray(prepared)) {
          effectiveHistory = prepared;
        } else {
          effectiveHistory = prepared.history;
          preparedDebug = prepared.debugContent;
        }
      }

      try {
        if (this.debugMode && preparedDebug) {
          await this.repo.appendMessage({
            role: 'debug',
            content: preparedDebug,
            conversationId,
            interactionId,
            provider: provider.name,
            aborted: false,
          });
        }

        if (provider.sendStream) {
          replyText = await provider.sendStream(text, effectiveHistory, pushChunk, controller.signal);
        } else {
          replyText = await provider.send(text, effectiveHistory);
          pushChunk(replyText);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          aborted = true;
          replyText = total;
        } else {
          const message = err instanceof Error ? err.message : String(err);
          replyText = `${t('errors.generic_error_prefix')} ${message}`;
          pushChunk(replyText);
        }
      } finally {
        this.controllers.delete(assistantId);
      }

      const finalMessage = await this.repo.appendMessage({
        role: 'assistant',
        content: replyText || total || '(no content)',
        conversationId,
        interactionId,
        aborted,
        provider: provider.name,
      });

      this.emitStream({ id: assistantId, interactionId, done: true, aborted });
      return finalMessage;
    });

    return assistantMessage;
  }

  /** Attempts to abort an in-flight assistant response. */
  cancel(id: string): boolean {
    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      this.controllers.delete(id);
      return true;
    }
    return false;
  }

  private async resolveProvider() {
    const subscribeWarnings = this.options?.subscribeWarnings;
    if (!this.unsubscribeWarning && subscribeWarnings) {
      this.unsubscribeWarning = subscribeWarnings((warning) => {
        this.warnings.push(warning);
        this.emit('warning', warning);
      });
    }
    if (this.options?.resolveProvider) {
      return this.options.resolveProvider();
    }
    return null;
  }
}
