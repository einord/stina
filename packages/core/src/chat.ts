import { EventEmitter } from 'node:events';

import { readSettings } from '@stina/settings';
import store, { ChatMessage } from '@stina/store';

import { createProvider } from './providers/index.js';
import { type WarningEvent, onWarning } from './warnings.js';

export type StreamEvent = {
  id: string;
  start?: boolean;
  delta?: string;
  done?: boolean;
  aborted?: boolean;
};

type MessagesListener = (messages: ChatMessage[]) => void;

/**
 * Produces a pseudo-random short identifier; used for correlating chat messages.
 * Call whenever a new user or assistant message is created.
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Central chat coordinator that streams between the store and active provider.
 * Instantiate once per process to orchestrate message history and warnings.
 */
export class ChatManager extends EventEmitter {
  private controllers = new Map<string, AbortController>();
  private lastNewSessionAt = 0;
  private warnings: WarningEvent[] = [];
  private unsubscribeWarning: (() => void) | null = null;

  /**
   * Returns the in-memory chat history as kept by the shared store.
   * Use in clients that need a synchronous snapshot of current messages.
   */
  getMessages(): ChatMessage[] {
    return store.getMessages();
  }

  /**
   * Subscribes to live chat updates and returns an unsubscribe function.
   * Handy for UIs that need to re-render whenever the store changes.
   */
  onMessages(listener: MessagesListener): () => void {
    return store.onMessages(listener);
  }

  /**
   * Listens for provider warnings emitted by this ChatManager instance.
   * Use this to surface provider misconfiguration or runtime issues in the UI.
   */
  onWarning(listener: (event: WarningEvent) => void): () => void {
    this.on('warning', listener);
    return () => this.off('warning', listener);
  }

  /**
   * Returns every warning captured so far; useful for debugging or diagnostics.
   */
  getWarnings(): WarningEvent[] {
    return [...this.warnings];
  }

  /**
   * Inserts an info message indicating a new session start, debounced to avoid spam.
   * Invoke when the user requests a fresh conversation.
   * @param label Optional custom text for the info message.
   */
  async newSession(label?: string): Promise<ChatMessage[]> {
    const now = Date.now();
    if (now - this.lastNewSessionAt < 400) {
      return store.getMessages();
    }
    this.lastNewSessionAt = now;
    await store.appendMessage({
      role: 'info',
      content: label ?? `New session • ${new Date(now).toLocaleString()}`,
      ts: now,
    });
    return store.getMessages();
  }

  /**
   * Appends a user message, forwards the conversation to the active provider, and streams back the assistant response.
   * Use whenever the UI sends user input that should reach the model.
   * @param text The user-entered content to send downstream.
   */
  async sendMessage(text: string): Promise<ChatMessage> {
    if (!text.trim()) {
      throw new Error('Cannot send empty message');
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    await store.appendMessage(userMessage);

    const history = store.getMessages();
    const provider = await this.resolveProvider();
    if (!provider) {
      return store.appendMessage({
        role: 'assistant',
        content: 'No provider selected in Settings.',
      });
    }

    const assistantId = generateId();
    const controller = new AbortController();
    this.controllers.set(assistantId, controller);

    this.emitStream({ id: assistantId, start: true });

    let total = '';
    const pushChunk = (delta: string) => {
      total += delta;
      if (delta) this.emitStream({ id: assistantId, delta });
    };

    let replyText = '';
    let aborted = false;

    try {
      if (provider.sendStream) {
        replyText = await provider.sendStream(text, history, pushChunk, controller.signal);
      } else {
        replyText = await provider.send(text, history);
        pushChunk(replyText);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        aborted = true;
        replyText = total;
      } else {
        const message = err instanceof Error ? err.message : String(err);
        replyText = `Error: ${message}`;
        pushChunk(replyText);
      }
    } finally {
      this.controllers.delete(assistantId);
    }

    const assistantMessage = await store.appendMessage({
      id: assistantId,
      role: 'assistant',
      content: replyText || total || '(no content)',
      aborted: aborted ? true : undefined,
    });

    this.emitStream({ id: assistantId, done: true, aborted });
    return assistantMessage;
  }

  /**
   * Attempts to abort an in-flight assistant response with the given message id.
   * Call this when the user cancels generation; returns true if a controller was aborted.
   */
  cancel(id: string): boolean {
    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      this.controllers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Registers a listener for delta stream events emitted during assistant generation.
   * Use this to mirror partial responses into UIs as they arrive.
   */
  onStream(listener: (event: StreamEvent) => void): () => void {
    this.on('stream', listener);
    return () => this.off('stream', listener);
  }

  /**
   * Internal helper that forwards stream events through the EventEmitter.
   */
  private emitStream(event: StreamEvent) {
    this.emit('stream', event);
  }

  /**
   * Reads the active provider from settings and instantiates it while wiring warning propagation.
   * Returns null if no provider is active or creation fails.
   */
  private async resolveProvider() {
    const settings = await readSettings();
    const active = settings.active;
    if (!active) return null;
    try {
      if (!this.unsubscribeWarning) {
        this.unsubscribeWarning = onWarning((warning) => {
          this.warnings.push(warning);
          this.emit('warning', warning);
        });
      }
      return createProvider(active, settings.providers);
    } catch (err) {
      console.error('[chat] failed to create provider', err);
      return null;
    }
  }
}
