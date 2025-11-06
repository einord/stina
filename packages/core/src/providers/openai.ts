import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

export class OpenAIProvider implements Provider {
  name = 'openai';

  constructor(private cfg: any) {}

  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('OpenAI API key missing');

    const base = this.cfg?.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.cfg?.model ?? 'gpt-4o-mini';

    const historyMessages = toChatHistory(history).map((m: any) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    let res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: toolSpecs.openai }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);

    let payload: any = await res.json();
    const assistantMessage = payload.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls ?? [];

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
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: followUpMessages, tools: toolSpecs.openai }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      payload = await res.json();
      return payload.choices?.[0]?.message?.content ?? '(no content)';
    }

    return assistantMessage?.content ?? '(no content)';
  }

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

    const historyMessages = toChatHistory(history).map((m: any) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
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
          const event = JSON.parse(payload);
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
