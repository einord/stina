import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs } from '../tools.js';
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
    const msgs = toChatHistory(history).map((m: any) => ({ role: m.role, content: m.content }));
    let res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, tools: toolSpecs.openai }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    let j: any = await res.json();
    const msg = j.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls ?? [];
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
      const msgs2 = [...msgs, msg, ...toolResults];
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: msgs2, tools: toolSpecs.openai }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      j = await res.json();
      return j.choices?.[0]?.message?.content ?? '(no content)';
    }
    return msg?.content ?? '(no content)';
  }

  // Streaming using SSE from chat/completions; tool calls are not streamed — if
  // a tool call is detected in the stream, we fall back to non-streaming.
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('OpenAI API key missing');
    const base = this.cfg?.baseUrl ?? 'https://api.openai.com/v1';
    const model = this.cfg?.model ?? 'gpt-4o-mini';
    const msgs = toChatHistory(history).map((m: any) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, stream: true }),
    });
    if (!res.ok || !res.body) {
      // Fallback to non-streaming on error
      return this.send(prompt, history);
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let total = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      // Parse SSE lines: lines starting with "data: " contain JSON payloads
      for (const line of chunk.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') break;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta;
          if (delta?.content) {
            total += delta.content;
            onDelta(delta.content);
          }
          // If tool_calls appear, abort streaming and fallback
          if (delta?.tool_calls) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore parse errors for keep-alives
        }
      }
    }
    return total || '(no content)';
  }
}
