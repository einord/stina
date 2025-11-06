import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
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
    const systemInstruction = { role: 'system', parts: [{ text: toolSystemPrompt }] };
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents, tools: toolSpecs.gemini, systemInstruction }),
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
        body: JSON.stringify({ contents: contents2, tools: toolSpecs.gemini, systemInstruction }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      j = await res.json();
    }
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '(no content)';
  }

  // Streaming using streamGenerateContent
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');
    const model = this.cfg?.model ?? 'gemini-1.5-flash';
    const base = this.cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const contents = toChatHistory(history).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const systemInstruction = { role: 'system', parts: [{ text: toolSystemPrompt }] };
    const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction }),
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
        if (!trimmed) continue;
        try {
          const j = JSON.parse(trimmed);
          const parts: any[] = j.candidates?.[0]?.content?.parts ?? [];
          if (parts.some((p: any) => p.functionCall)) {
            return this.send(prompt, history);
          }
          const chunk = parts.map((p: any) => p.text ?? '').join('');
          if (chunk) {
            total += chunk;
            onDelta(chunk);
          }
        } catch {
          // ignore
        }
      }
    }
    return total || '(no content)';
  }
}
