import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs } from '../tools.js';
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
    const msgs = toChatHistory(history).map((m) => ({
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
      body: JSON.stringify({ model, messages: msgs, max_tokens: 1024, tools: toolSpecs.anthropic }),
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
        ...msgs,
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
}
