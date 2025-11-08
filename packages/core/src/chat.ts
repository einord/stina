import { EventEmitter } from 'node:events';

import { readSettings } from '@stina/settings';
import store, { ChatMessage } from '@stina/store';

import { createProvider } from './providers/index.js';
import { onWarning, type WarningEvent } from './warnings.js';

export type StreamEvent = {
  id: string;
  start?: boolean;
  delta?: string;
  done?: boolean;
  aborted?: boolean;
};

type MessagesListener = (messages: ChatMessage[]) => void;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class ChatManager extends EventEmitter {
  private controllers = new Map<string, AbortController>();
  private lastNewSessionAt = 0;
  private warnings: WarningEvent[] = [];
  private unsubscribeWarning: (() => void) | null = null;

  getMessages(): ChatMessage[] {
    return store.getMessages();
  }

  onMessages(listener: MessagesListener): () => void {
    return store.onMessages(listener);
  }

  onWarning(listener: (event: WarningEvent) => void): () => void {
    this.on('warning', listener);
    return () => this.off('warning', listener);
  }

  getWarnings(): WarningEvent[] {
    return [...this.warnings];
  }

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

  cancel(id: string): boolean {
    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      this.controllers.delete(id);
      return true;
    }
    return false;
  }

  onStream(listener: (event: StreamEvent) => void): () => void {
    this.on('stream', listener);
    return () => this.off('stream', listener);
  }

  private emitStream(event: StreamEvent) {
    this.emit('stream', event);
  }

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
