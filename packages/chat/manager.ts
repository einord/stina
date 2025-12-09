import { EventEmitter } from 'node:events';

import { getLang, t } from '@stina/i18n';

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
  /**
   * Optional builder for prompt preludes. The returned content is persisted as an instructions
   * message inside the current interaction before the user message is sent so history matches
   * exactly what the provider receives.
   */
  buildPromptPrelude?: (context: {
    conversationId: string;
  }) => Promise<{ content: string; debugContent?: string } | null>;
  /** Optional override for reading settings (used in tests to avoid keytar/disk hits). */
  readSettings?: () => Promise<SettingsState | null>;
};

type SettingsState = import('@stina/settings').SettingsState;

const IDLE_NOTICE_THRESHOLD_MS = 1000 * 60 * 60 * 1; // 1 hour

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
    void this.repo
      .getCurrentConversationId()
      .then(listener)
      .catch(() => undefined);
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

  /**
   * Removes the latest interaction and replays its first message (instructions/user) as a new send.
   * Returns the newly created message, or null if no interaction could be retried.
   */
  async retryLastInteraction(): Promise<InteractionMessage | null> {
    const interactions = await this.repo.getInteractions();
    const last = interactions[interactions.length - 1];
    if (!last || !last.messages.length) return null;

    const sorted = [...last.messages].sort((a, b) => a.ts - b.ts);
    const seed = sorted[0];
    const role: InteractionMessage['role'] = seed.role === 'instructions' ? 'instructions' : 'user';

    await this.repo.deleteInteraction(last.id);
    return this.sendMessage(seed.content, role);
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
  async sendMessage(
    text: string,
    role: InteractionMessage['role'] = 'user',
  ): Promise<InteractionMessage> {
    if (!text.trim()) {
      throw new Error(t('errors.empty_message'));
    }

    const conversationId = await this.repo.getCurrentConversationId();
    const interactionId = `ia_${Math.random().toString(36).slice(2, 10)}`;

    let history = await this.repo.getMessagesForConversation(conversationId);

    if (!this.hasMetadataKind(history, 'prompt-prelude')) {
      await this.appendPromptPrelude(conversationId, interactionId);
      history = await this.repo.getMessagesForConversation(conversationId);
    }

    if (role === 'user') {
      await this.appendIdleSystemMessages(history, conversationId, interactionId);
      history = await this.repo.getMessagesForConversation(conversationId);
    }

    await this.repo.appendMessage({
      role,
      content: text,
      conversationId,
      interactionId,
      aborted: false,
    });

    const assistantMessage = await this.repo.withInteractionContext(interactionId, async () => {
      history = await this.repo.getMessagesForConversation(conversationId);

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
      const providerHistory = history.filter((message) => message.role !== 'debug');

      try {
        if (provider.sendStream) {
          replyText = await provider.sendStream(
            text,
            providerHistory,
            pushChunk,
            controller.signal,
          );
        } else {
          replyText = await provider.send(text, providerHistory);
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

  /**
   * Persists a prompt prelude as an instructions message so the sent history matches the UI.
   */
  private async appendPromptPrelude(
    conversationId: string,
    interactionId: string,
  ): Promise<InteractionMessage | null> {
    if (!this.options.buildPromptPrelude) return null;
    if (this.hasMetadataKind(await this.repo.getMessagesForConversation(conversationId), 'prompt-prelude')) {
      return null;
    }

    const prelude = await this.options.buildPromptPrelude({ conversationId });
    if (!prelude?.content?.trim()) return null;

    const message = await this.repo.appendMessage({
      role: 'instructions',
      content: prelude.content,
      conversationId,
      interactionId,
      metadata: { kind: 'prompt-prelude' },
    });

    if (this.debugMode && prelude.debugContent) {
      await this.repo.appendMessage({
        role: 'debug',
        content: prelude.debugContent,
        conversationId,
        interactionId,
        provider: null,
        aborted: false,
      });
    }

    return message;
  }

  /**
   * Appends system/info messages when a user returns after a long idle period.
   * This is invoked per interaction so the provider always sees up-to-date time context.
   */
  private async appendIdleSystemMessages(
    history: InteractionMessage[],
    conversationId: string,
    interactionId: string,
  ): Promise<InteractionMessage[]> {
    const latestUser = [...history].reverse().find((msg) => msg.role === 'user');
    if (!latestUser) return [];

    const previousUser = [...history]
      .filter((msg) => msg.role === 'user' && msg.ts < latestUser.ts)
      .sort((a, b) => a.ts - b.ts)
      .pop();
    if (!previousUser) return [];

    const gapMs = latestUser.ts - previousUser.ts;
    if (gapMs < IDLE_NOTICE_THRESHOLD_MS) return [];

    const settingsOverride = this.options?.readSettings
      ? await this.options.readSettings()
      : undefined;
    const settings = settingsOverride !== undefined ? settingsOverride : await this.readSettingsSafe();
    const locale = this.resolveLocale(settings);
    const userName = this.resolveUserName(settings);
    const addedMessages: InteractionMessage[] = [];

    if (!this.hasMetadataKind(history, 'idle-anchor')) {
      const firstUser = [...history].find((msg) => msg.role === 'user') ?? previousUser;
      const firstFormatted = this.formatDateTimeForLocale(firstUser.ts, locale);
      const currentFormatted = this.formatDateTimeForLocale(Date.now(), locale);
      const anchorContent = t('chat.idle.first_anchor', {
        firstDate: firstFormatted.date,
        firstTime: firstFormatted.time,
        currentDate: currentFormatted.date,
        currentTime: currentFormatted.time,
      });
      const anchor = await this.repo.appendMessage({
        role: 'info',
        content: anchorContent,
        conversationId,
        interactionId,
        metadata: { kind: 'idle-anchor' },
      });
      addedMessages.push(anchor);
      history = [...history, anchor];
    }

    const hours = Math.max(1, Math.floor(gapMs / (1000 * 60 * 60)));
    const current = this.formatDateTimeForLocale(Date.now(), locale);
    const gapContent = t('chat.idle.gap_notice', {
      hours,
      userName,
      date: current.date,
      time: current.time,
    });
    const gap = await this.repo.appendMessage({
      role: 'info',
      content: gapContent,
      conversationId,
      interactionId,
      metadata: { kind: 'idle-gap', gapMs },
    });
    addedMessages.push(gap);

    return addedMessages;
  }

  /** Attempts to load settings without failing the chat flow. */
  private async readSettingsSafe(): Promise<SettingsState | null> {
    try {
      const { readSettings } = await import('@stina/settings');
      return await readSettings();
    } catch (err) {
      if (this.debugMode) {
        console.warn('[chat] failed to read settings for idle notice', err);
      }
      return null;
    }
  }

  /** Resolves locale preference from settings with runtime fallback. */
  private resolveLocale(settings: SettingsState | null): string {
    return settings?.desktop?.language || getLang() || 'en';
  }

  /** Resolves preferred user-facing name for system notices. */
  private resolveUserName(settings: SettingsState | null): string {
    const nick = settings?.userProfile?.nickname?.trim();
    if (nick) return nick;
    const first = settings?.userProfile?.firstName?.trim();
    if (first) return first;
    return t('chat.idle.default_user_name');
  }

  /** Parses metadata to check if a prior idle marker was already emitted. */
  private hasMetadataKind(history: InteractionMessage[], kind: string): boolean {
    return history.some((msg) => this.parseMetadata(msg.metadata)?.kind === kind);
  }

  /** Safely parses message metadata. */
  private parseMetadata(raw: unknown): { kind?: string } | null {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof raw === 'object') return raw as { kind?: string };
    return null;
  }

  /** Formats a timestamp into natural language date/time for the active locale. */
  private formatDateTimeForLocale(ts: number, locale: string): { date: string; time: string } {
    const date = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(ts);
    const time = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(ts);
    return { date, time };
  }
}
