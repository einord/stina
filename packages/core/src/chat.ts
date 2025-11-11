import { EventEmitter } from 'node:events';

import { t } from '@stina/i18n';
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
 * Formats the result of list_tools into a human-readable message for the model.
 * This gives the model context about what it can do at the start of each session.
 */
function formatToolDiscoveryMessage(result: unknown): string {
  if (!result || typeof result !== 'object') {
    return 'Available tools: Unable to load tool list.';
  }

  const data = result as {
    ok?: boolean;
    builtin?: Array<{ name: string; description: string }>;
    servers?: Array<{ name: string; tools?: unknown; error?: string }>;
  };

  if (data.ok === false) {
    return 'Available tools: Error loading tools.';
  }

  const lines: string[] = ['📦 Available tools for this session:'];

  // Built-in tools
  if (data.builtin && data.builtin.length > 0) {
    lines.push('\n**Built-in tools:**');
    for (const tool of data.builtin) {
      const desc = tool.description.split('\n')[0].replace(/\*\*/g, '').substring(0, 100);
      lines.push(`• ${tool.name} - ${desc}`);
    }
  }

  // MCP server tools
  if (data.servers && data.servers.length > 0) {
    for (const server of data.servers) {
      if (server.error) {
        lines.push(`\n**${server.name}:** (unavailable - ${server.error})`);
        continue;
      }

      const tools = extractServerTools(server.tools);
      if (tools.length > 0) {
        lines.push(`\n**${server.name}:** (${tools.length} tools available)`);
        for (const tool of tools.slice(0, 5)) {
          const desc = tool.description?.split('\n')[0].substring(0, 80) || 'No description';
          lines.push(`• ${tool.name} - ${desc}`);
        }
        if (tools.length > 5) {
          lines.push(`  ...and ${tools.length - 5} more`);
        }
      }
    }
  }

  return lines.join('\n');
}

/**
 * Extracts tool list from server response which may be wrapped in different formats.
 */
function extractServerTools(tools: unknown): Array<{ name: string; description?: string }> {
  if (!tools) return [];
  if (Array.isArray(tools)) return tools;
  if (typeof tools === 'object' && 'tools' in tools) {
    const nested = (tools as { tools: unknown }).tools;
    if (Array.isArray(nested)) return nested;
  }
  return [];
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
  private async logDebug(content: string, prefix = '🔍'): Promise<void> {
    if (!this.debugMode) return;
    await store.appendMessage({
      role: 'debug',
      content: `${prefix} ${content}`,
      ts: Date.now(),
    });
  }

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
    const now = Date.now();
    if (now - this.lastNewSessionAt < 400) {
      return store.getMessages();
    }
    this.lastNewSessionAt = now;

    await this.logDebug('Starting new session...');

    // Refresh MCP tool cache at the start of each session
    const { refreshMCPToolCache, runTool } = await import('./tools.js');
    await this.logDebug('Refreshing MCP tool cache...');
    await refreshMCPToolCache();

    await store.appendMessage({
      role: 'info',
      content: label ?? t('chat.new_session'),
      ts: now,
    });

    // Refresh tool cache so providers have access to all tools
    await this.logDebug('Tool cache refreshed');

    // In debug mode, show what tools are available
    if (this.debugMode) {
      const toolsResult = await runTool('list_tools', {});
      const toolsMessage = formatToolDiscoveryMessage(toolsResult);
      await this.logDebug(`Available tools:\n${toolsMessage}`, '🔧');
    }

    await this.logDebug('Sending system prompt to model...');
    const systemPrompt = t('chat.system_prompt');
    await this.logDebug(`System prompt:\n${systemPrompt}`, '📝');

    // Don't send system prompt as a regular message - it's just for context
    // The provider will use it internally via the history

    return store.getMessages();
  }

  /**
   * Appends a user message, forwards the conversation to the active provider, and streams back the assistant response.
   * Use whenever the UI sends user input that should reach the model.
   * @param text The user-entered content to send downstream.
   * @param isSystemMessage If true, this is a system/internal message (no debug logging for user input)
   */
  async sendMessage(text: string, isSystemMessage = false): Promise<ChatMessage> {
    if (!text.trim()) {
      throw new Error(t('errors.empty_message'));
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      ts: Date.now(),
    };
    await store.appendMessage(userMessage);

    // Only log user messages in debug mode, not system messages
    if (this.debugMode && !isSystemMessage) {
      await this.logDebug(
        `User message: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`,
        '💬',
      );
    }

    const history = store.getMessages();
    const provider = await this.resolveProvider();
    if (!provider) {
      if (this.debugMode) {
        await this.logDebug('No provider configured', '⚠️');
      }
      return store.appendMessage({
        role: 'assistant',
        content: t('errors.no_provider'),
      });
    }

    if (this.debugMode) {
      await this.logDebug(`Using provider: ${provider.constructor.name}`, '🤖');

      // Show what tools are being sent to the provider
      const { getToolCatalog } = await import('./tools.js');
      const catalog = getToolCatalog();
      const toolNames = catalog.map((t) => t.name).join(', ');
      await this.logDebug(`Provider tools: [${toolNames}] (${catalog.length} total)`, '🔧');
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
      if (this.debugMode) {
        await this.logDebug(
          provider.sendStream
            ? 'Streaming response from provider...'
            : 'Requesting response from provider...',
          '📡',
        );
      }

      if (provider.sendStream) {
        replyText = await provider.sendStream(text, history, pushChunk, controller.signal);
      } else {
        replyText = await provider.send(text, history);
        pushChunk(replyText);
      }

      if (this.debugMode) {
        await this.logDebug(`Response received (${replyText.length} chars)`, '✅');
      }
    } catch (err) {
      if (controller.signal.aborted) {
        aborted = true;
        replyText = total;
        if (this.debugMode) {
          await this.logDebug('Response aborted by user', '🛑');
        }
      } else {
        const message = err instanceof Error ? err.message : String(err);
        if (this.debugMode) {
          await this.logDebug(`Error: ${message}`, '❌');
        }
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
