import { EventEmitter } from 'node:events';

import { t } from '@stina/i18n';
import { readSettings } from '@stina/settings';
import store, { ChatMessage, ChatRole } from '@stina/store';

import { generateNewSessionStartPrompt } from './chat.systemPrompt.js';
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
  private debugMode = false;

  /**
   * Sets debug mode which shows system messages, tool calls, and other internal operations.
   * @param enabled Whether debug mode should be enabled.
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Logs a debug message to the chat if debug mode is enabled.
   * @param content The debug message content.
   * @param prefix Optional prefix for the message.
   */
  // private async logDebug(content: string, prefix = '🔍'): Promise<void> {
  //   if (!this.debugMode) return;
  //   await store.appendMessage({
  //     role: 'debug',
  //     content: `${prefix} ${content}`,
  //     ts: Date.now(),
  //   });
  // }

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
   * Also refreshes the MCP tool cache and automatically lists all available tools
   * so the model has full context about its capabilities from the start.
   * @param label Optional custom text for the info message.
   */
  async newSession(label?: string): Promise<ChatMessage[]> {
    // Debounce rapid new session requests
    const now = Date.now();
    if (now - this.lastNewSessionAt < 400) {
      return store.getMessages();
    }
    this.lastNewSessionAt = now;

    // await this.logDebug('Starting new session...');

    // Switch to a new conversation id so future turns don't reuse past history.
    store.startNewConversation();

    // Refresh MCP tool cache at the start of each session
    const { refreshMCPToolCache } = await import('./tools.js');
    // await this.logDebug('Refreshing MCP tool cache...');
    await refreshMCPToolCache();

    // Show new session message to the user
    const sessionLabel = label?.trim() ? label : t('chat.new_session');
    await store.appendInfoMessage(sessionLabel);

    // Add initial instructions to the model
    const firstMessage = await generateNewSessionStartPrompt();

    // Send the session start prompt as instructions message to differentiate from user input
    await this.sendMessage(firstMessage, 'instructions');

    return store.getMessages();
  }

  /**
   * Appends a user message, forwards the conversation to the active provider, and streams back the assistant response.
   * Use whenever the UI sends user input that should reach the model.
   * @param text The user-entered content to send downstream.
   * @param isSystemMessage If true, this is a system/internal message (no debug logging for user input)
   */
  async sendMessage(text: string, role: ChatRole = 'user'): Promise<ChatMessage> {
    if (!text.trim()) {
      throw new Error(t('errors.empty_message'));
    }

    const currentConversationId = store.getCurrentConversationId();

    const userMessage: ChatMessage = {
      id: generateId(),
      role: role,
      content: text,
      ts: Date.now(),
      conversationId: currentConversationId,
    };
    await store.appendMessage(userMessage);

    const history = store.getMessagesForConversation(currentConversationId);
    const provider = await this.resolveProvider();

    // Only log user messages in debug mode, not system messages
    if (this.debugMode) {
      const debugMessage = `Provider: ${provider?.constructor.name ?? '⚠️'}

${text}`;
      await store.appendMessage({
        role: 'debug',
        content: debugMessage,
        ts: Date.now(),
      });
    }

    if (!provider) {
      return store.appendMessage({
        role: 'error',
        content: t('errors.no_provider'),
      });
    }

    if (this.debugMode) {
      // await this.logDebug(`Using provider: ${provider.constructor.name}`, '🤖');
      // // Show what tools are being sent to the provider
      // const { getToolCatalog } = await import('./tools.js');
      // const catalog = getToolCatalog();
      // const toolNames = catalog.map((t) => t.name).join(', ');
      // await this.logDebug(`Provider tools: [${toolNames}] (${catalog.length} total)`, '🔧');
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
      // if (this.debugMode) {
      //   await this.logDebug(
      //     provider.sendStream
      //       ? 'Streaming response from provider...'
      //       : 'Requesting response from provider...',
      //     '📡',
      //   );
      // }

      if (provider.sendStream) {
        replyText = await provider.sendStream(text, history, pushChunk, controller.signal);
      } else {
        replyText = await provider.send(text, history);
        pushChunk(replyText);
      }

      // if (this.debugMode) {
      //   await this.logDebug(`Response received (${replyText.length} chars)`, '✅');
      // }
    } catch (err) {
      if (controller.signal.aborted) {
        aborted = true;
        replyText = total;
        // if (this.debugMode) {
        //   await this.logDebug('Response aborted by user', '🛑');
        // }
      } else {
        const message = err instanceof Error ? err.message : String(err);
        // if (this.debugMode) {
        //   await this.logDebug(`Error: ${message}`, '❌');
        // }
        replyText = `${t('errors.generic_error_prefix')} ${message}`;
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
      conversationId: currentConversationId,
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
