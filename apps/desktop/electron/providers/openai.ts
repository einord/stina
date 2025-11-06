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
}
