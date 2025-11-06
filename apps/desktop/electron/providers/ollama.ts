import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

export class OllamaProvider implements Provider {
  name = 'ollama';

  constructor(private cfg: any) {}

  /**
   * Non-streaming chat completion with tool execution support.
   */
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    // Include chat history and system tool instructions.
    const historyMessages = toChatHistory(history).map((m) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    // First request – allow the model to respond or request tools.
    let res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, tools: toolSpecs.ollama }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);

    let payload: any = await res.json();
    const assistantMessage = payload?.message;
    const toolCalls = assistantMessage?.tool_calls ?? [];

    // If the model asked for tools, execute them and send the results back.
    if (toolCalls.length > 0) {
      const toolResults = [] as any[];
      for (const tc of toolCalls) {
        const name = tc.function?.name;

        let args: any = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {}

        const result = await runTool(name, args);
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      const followUpMessages = [...messages, assistantMessage, ...toolResults];
      res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: followUpMessages,
          stream: false,
          tools: toolSpecs.ollama,
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      payload = await res.json();
    }

    return payload?.message?.content ?? '(no content)';
  }

  /**
   * Streaming variant – falls back to non-streaming when tool calls appear.
   */
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const historyMessages = toChatHistory(history).map((m) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, tools: toolSpecs.ollama }),
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
        if (!trimmed) continue;

        try {
          const chunk = JSON.parse(trimmed);
          const delta = chunk.message?.content ?? chunk.response ?? '';
          if (delta) {
            total += delta;
            onDelta(delta);
          }

          const streamedToolCalls = chunk.message?.tool_calls ?? chunk.tool_calls ?? [];
          if (Array.isArray(streamedToolCalls) && streamedToolCalls.length > 0) {
            // Restart via the non-streaming path so tools run correctly.
            return this.send(prompt, history);
          }
        } catch {
          // Ignore JSON parse errors from keep-alive lines.
        }
      }
    }

    return total || '(no content)';
  }
}
