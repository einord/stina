import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs } from '../tools.js';

import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

export class GeminiProvider implements Provider {
  name = 'gemini';
  constructor(private cfg: any) {}
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');
    const model = this.cfg?.model ?? 'gemini-1.5-flash';
    const base = this.cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const contents = toChatHistory(history).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents, tools: toolSpecs.gemini }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    let j: any = await res.json();
    const parts: any[] = j.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (calls.length > 0) {
      const responseParts = await Promise.all(
        calls.map(async (c: any) => ({
          functionResponse: {
            name: c.functionCall.name,
            response: await runTool(c.functionCall.name, c.functionCall.args),
          },
        })),
      );
      const contents2 = [
        ...contents,
        { role: 'model', parts },
        { role: 'user', parts: responseParts },
      ];
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: contents2, tools: toolSpecs.gemini }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      j = await res.json();
    }
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '(no content)';
  }
}
