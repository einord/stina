import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  constructor(private cfg: any) {}
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Anthropic API key missing');
    const base = this.cfg?.baseUrl ?? 'https://api.anthropic.com';
    const model = this.cfg?.model ?? 'claude-3-5-haiku-latest';
    const messages = toChatHistory(history).map((m) => ({
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
        system: toolSystemPrompt,
        messages,
        max_tokens: 1024,
        tools: toolSpecs.anthropic,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    let j: any = await res.json();
    const content: any[] = j.content ?? [];
    const toolUses = content.filter((c: any) => c.type === 'tool_use');
    if (toolUses.length > 0) {
      const toolResults = await Promise.all(
        toolUses.map(async (tu: any) => {
          const res = await runTool(tu.name, tu.input);
          return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(res) };
        }),
      );
      const messages2 = [
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
          system: toolSystemPrompt,
          messages: messages2,
          max_tokens: 1024,
          tools: toolSpecs.anthropic,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      j = await res.json();
    }
    const text = j.content?.[0]?.text ?? j.content?.map((c: any) => c.text).join('');
    return text ?? '(no content)';
  }

  // Streaming via SSE from /v1/messages with { stream: true }
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Anthropic API key missing');
    const base = this.cfg?.baseUrl ?? 'https://api.anthropic.com';
    const model = this.cfg?.model ?? 'claude-3-5-haiku-latest';
    const messages = toChatHistory(history).map((m) => ({
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
      body: JSON.stringify({ model, system: toolSystemPrompt, messages, max_tokens: 1024, stream: true }),
      signal,
    });
    if (!res.ok || !res.body) return this.send(prompt, history);

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let total = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = dec.decode(value, { stream: true });
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '' || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          // Typical SSE events include { type: 'content_block_delta', delta: { type: 'text_delta', text } }
          const chunk = evt?.delta?.text ?? evt?.text ?? '';
          if (chunk) {
            total += chunk;
            onDelta(chunk);
          }
          // If a tool-use is indicated in stream, fallback (not supported streaming here)
          if (evt?.type === 'tool_use' || evt?.content?.some?.((c: any) => c.type === 'tool_use')) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore
        }
      }
    }
    return total || '(no content)';
  }
}
