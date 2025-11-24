import type { AnthropicConfig } from '@stina/settings';
import type { InteractionMessage } from '../../chat/index.js';

// import { getToolSpecs, getToolSystemPrompt, runTool } from '../tools.js';
import { getToolSpecs, runTool } from '../tools.js';

import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;
type AnthropicToolResult = { type: 'tool_result'; tool_use_id?: string; content: string };
type AnthropicMessage = {
  role: string;
  content: AnthropicContentBlock[] | AnthropicToolResult[];
};
type AnthropicResponse = { content?: AnthropicContentBlock[] };
type AnthropicStreamEvent = {
  type?: string;
  delta?: { text?: string };
  text?: string;
  content?: AnthropicContentBlock[];
};

/**
 * Provider that integrates with Anthropic's Messages API including tool usage.
 */
export class AnthropicProvider implements Provider {
  name = 'anthropic';

  /**
   * @param cfg Anthropic-specific configuration loaded from settings.
   */
  constructor(private cfg: AnthropicConfig | undefined) {}

  /**
   * Sends a single completion request and handles any follow-up tool messages automatically.
   */
  async send(prompt: string, history: InteractionMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Anthropic API key missing');

    const base = this.cfg?.baseUrl ?? 'https://api.anthropic.com';
    const model = this.cfg?.model ?? 'claude-3-5-haiku-latest';
    const conversationId = store.getCurrentConversationId();

    const specs = getToolSpecs();
    // const systemPrompt = getToolSystemPrompt();

    const messages: AnthropicMessage[] = toChatHistory(conversationId, history).map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }));

    let res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        tools: specs.anthropic,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);

    let payload = (await res.json()) as AnthropicResponse;
    const content = payload.content ?? [];
    const toolUses = content.filter(isToolUse);

    if (toolUses.length > 0) {
      const toolResults: AnthropicToolResult[] = await Promise.all(
        toolUses.map(async (tu) => {
          const result = await runTool(tu.name, tu.input);
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) };
        }),
      );

      const followUpMessages: AnthropicMessage[] = [
        ...messages,
        { role: 'assistant', content },
        { role: 'user', content: toolResults },
      ];

      res = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: followUpMessages,
          max_tokens: 1024,
          tools: specs.anthropic,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      payload = (await res.json()) as AnthropicResponse;
    }

    const text = payload.content
      ?.map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    return text ?? '(no content)';
  }

  /**
   * Streams partial responses from Anthropic, falling back to send() when tool calls appear.
   */
  async sendStream(
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Anthropic API key missing');

    const base = this.cfg?.baseUrl ?? 'https://api.anthropic.com';
    const model = this.cfg?.model ?? 'claude-3-5-haiku-latest';
    const conversationId = store.getCurrentConversationId();

    // const systemPrompt = getToolSystemPrompt();

    const messages: AnthropicMessage[] = toChatHistory(conversationId, history).map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }],
    }));

    const res = await fetch(`${base}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        stream: true,
      }),
      signal,
    });
    if (!res.ok || !res.body) return this.send(prompt, history);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let total = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;

        try {
          const evt = JSON.parse(payload) as AnthropicStreamEvent;
          const chunk = evt.delta?.text ?? evt.text ?? '';
          if (chunk) {
            total += chunk;
            onDelta(chunk);
          }

          if (evt.type === 'tool_use' || hasToolUse(evt.content)) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore keep-alive lines
        }
      }
    }

    return total || '(no content)';
  }
}

/**
 * Type guard that identifies tool_use content blocks.
 */
function isToolUse(block: AnthropicContentBlock): block is AnthropicToolUseBlock {
  return block.type === 'tool_use';
}

/**
 * Returns true if a list of content blocks includes a tool_use entry.
 */
function hasToolUse(blocks?: AnthropicContentBlock[]): boolean {
  if (!Array.isArray(blocks)) return false;
  return blocks.some(isToolUse);
}
