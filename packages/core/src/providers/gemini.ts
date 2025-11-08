import type { GeminiConfig } from '@stina/settings';
import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

type GeminiFunctionCall = { name?: string; args?: unknown };
type GeminiPart = { text?: string } | { functionCall?: GeminiFunctionCall };
type GeminiContent = { parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[] };
type GeminiStreamChunk = GeminiResponse;
type GeminiToolResponsePart = {
  functionResponse: { name?: string; response: unknown };
};

export class GeminiProvider implements Provider {
  name = 'gemini';

  constructor(private cfg: GeminiConfig | undefined) {}

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

    let payload = (await res.json()) as GeminiResponse;
    const parts = getParts(payload);
    const calls = parts.filter(hasFunctionCall);

    if (calls.length > 0) {
      const responseParts: GeminiToolResponsePart[] = await Promise.all(
        calls.map(async (c) => ({
          functionResponse: {
            name: c.functionCall?.name,
            response: await runTool(c.functionCall?.name, c.functionCall?.args),
          },
        })),
      );

      const followUpContents = [
        ...contents,
        { role: 'model', parts },
        { role: 'user', parts: responseParts },
      ];

      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: followUpContents, tools: toolSpecs.gemini, systemInstruction }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      payload = (await res.json()) as GeminiResponse;
    }

    return getParts(payload)
      .map((p) => ('text' in p ? p.text ?? '' : ''))
      .join('')
      .trim() || '(no content)';
  }

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
          const payload = JSON.parse(trimmed) as GeminiStreamChunk;
          const parts = getParts(payload);

          if (parts.some(hasFunctionCall)) {
            return this.send(prompt, history);
          }

          const chunk = parts.map((p) => ('text' in p ? p.text ?? '' : '')).join('');
          if (chunk) {
            total += chunk;
            onDelta(chunk);
          }
        } catch {
          // ignore keep-alive packets
        }
      }
    }

    return total || '(no content)';
  }
}

function getParts(response: GeminiResponse): GeminiPart[] {
  const candidate = response.candidates?.[0];
  return candidate?.content?.parts ?? [];
}

function hasFunctionCall(part: GeminiPart): part is { functionCall: GeminiFunctionCall } {
  return 'functionCall' in part && !!part.functionCall;
}
