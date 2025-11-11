import type { OpenAIConfig } from '@stina/settings';
import { ChatMessage } from '@stina/store';

// import { getToolSpecs, getToolSystemPrompt, runTool } from '../tools.js';
import { getToolSpecs, runTool } from '../tools.js';

import { Provider } from './types.js';
import { normalizeToolArgs, toChatHistory } from './utils.js';

/**
 * Provider implementation that talks to OpenAI's chat completions API.
 * Supports both single-shot and streaming conversations with tool calling support.
 */
export class OpenAIProvider implements Provider {
  name = 'openai';

  /**
   * @param cfg User-supplied OpenAI configuration such as API key and base URL.
   */
  constructor(private cfg: OpenAIConfig | undefined) {}

  /**
   * Sends the prompt/history to OpenAI, handling tool calls automatically if requested.
   * @param prompt Latest user message.
   * @param history Full chat history to include in the API request.
   */
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('OpenAI API key missing');

    const base = this.cfg?.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.cfg?.model ?? 'gpt-4o-mini';

    const specs = getToolSpecs();
    // const systemPrompt = getToolSystemPrompt();

    const historyMessages = toChatHistory(history).map((m) => ({
      role: m.role === 'instructions' ? 'user' : m.role, // Convert instructions to user for OpenAI
      content: m.content,
    }));

    // const messages = [{ role: 'system', content: systemPrompt }, ...historyMessages];
    const messages = historyMessages;
    const data = { model, messages, tools: specs.openai };
    console.log(`> [OpenAI] Sending request with ${specs.openai?.length ?? 0} tools`);
    let res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[OpenAI] Error ${res.status}:`, errorText);
      try {
        const errorJson = JSON.parse(errorText);
        console.error('[OpenAI] Error details:', JSON.stringify(errorJson, null, 2));
      } catch {
        // Not JSON, already logged as text
      }
      throw new Error(`OpenAI ${res.status}`);
    }

    let payload = (await res.json()) as OpenAIChatResponse;
    const assistantMessage = payload.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls ?? [];

    if (toolCalls.length > 0) {
      const toolResults: ToolResult[] = [];
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        const rawArgs = tc.function?.arguments;
        console.log('[openai] tool_call', name, rawArgs ?? '(no args)');

        if (!name) continue;
        const args = normalizeToolArgs(rawArgs);
        const result = await runTool(name, args);
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      const followUpMessages = [...messages, assistantMessage, ...toolResults];
      const moreData = { model, messages: followUpMessages, tools: specs.openai };
      console.log(`> [OpenAI] Follow-up request after tool calls`);
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(moreData),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`[OpenAI] Follow-up error ${res.status}:`, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          console.error('[OpenAI] Error details:', JSON.stringify(errorJson, null, 2));
        } catch {
          // Not JSON, already logged as text
        }
        throw new Error(`OpenAI ${res.status}`);
      }
      payload = (await res.json()) as OpenAIChatResponse;
      return payload.choices?.[0]?.message?.content ?? '(no content)';
    }

    return assistantMessage?.content ?? '(no content)';
  }

  /**
   * Streams an OpenAI response by wiring into the SSE feed, falling back to send() if needed.
   * @param prompt Latest user message.
   * @param history Previous conversation history.
   * @param onDelta Callback for partial text.
   * @param signal Optional abort signal from the caller.
   */
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('OpenAI API key missing');

    const base = this.cfg?.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.cfg?.model ?? 'gpt-4o-mini';

    // const systemPrompt = getToolSystemPrompt();

    const historyMessages = toChatHistory(history).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    // const messages = [{ role: 'system', content: systemPrompt }, ...historyMessages];
    const messages = historyMessages;
    const data = { model, messages, stream: true };
    console.log(`> [OpenAI] ${JSON.stringify(data)}`);
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal,
    });
    if (!res.ok || !res.body) {
      return this.send(prompt, history);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let total = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;

        try {
          const event = JSON.parse(payload) as OpenAIStreamEvent;
          const delta = event.choices?.[0]?.delta;

          if (delta?.content) {
            total += delta.content;
            onDelta(delta.content);
          }

          if (delta?.tool_calls) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore SSE keep-alive lines
        }
      }
    }

    return total || '(no content)';
  }
}

type OpenAIToolCall = {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

type ToolResult = { role: 'tool'; tool_call_id?: string; content: string };

type OpenAIChatMessage = {
  role: string;
  content?: string;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: OpenAIChatMessage;
  }>;
};

type OpenAIStreamDelta = {
  content?: string;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIStreamEvent = {
  choices?: Array<{
    delta?: OpenAIStreamDelta;
  }>;
};
