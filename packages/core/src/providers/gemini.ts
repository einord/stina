import type { GeminiConfig } from '@stina/settings';
import store, { InteractionMessage } from '@stina/store';

// import { getToolSpecs, getToolSystemPrompt, runTool } from '../tools.js';
import { getToolSpecs, runTool } from '../tools.js';

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

/**
 * Provider implementation for Google's Gemini API with tool-call handling.
 */
export class GeminiProvider implements Provider {
  name = 'gemini';

  /**
   * @param cfg User configuration such as API key, base URL, and model name.
   */
  constructor(private cfg: GeminiConfig | undefined) {}

  /**
   * Sends a single non-streaming request to Gemini, handling function calls and follow-ups.
   */
  async send(prompt: string, history: InteractionMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');

    const model = this.cfg?.model ?? 'gemini-1.5-flash';
    const base = this.cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const conversationId = store.getCurrentConversationId();

    const specs = getToolSpecs();
    // const systemPrompt = getToolSystemPrompt();

    const contents = toChatHistory(conversationId, history).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    // const systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };

    const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents, tools: specs.gemini }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);

    let payload = (await res.json()) as GeminiResponse;
    const parts = getParts(payload);
    const calls = parts.filter(hasFunctionCall);

    if (calls.length > 0) {
      const responseParts: GeminiToolResponsePart[] = await Promise.all(
        calls.map(async (c) => {
          const name = c.functionCall?.name;
          if (!name) return { functionResponse: { name: '', response: {} } };
          return {
            functionResponse: {
              name,
              response: await runTool(name, c.functionCall?.args),
            },
          };
        }),
      );

      const followUpContents = [
        ...contents,
        { role: 'model', parts },
        { role: 'user', parts: responseParts },
      ];

      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: followUpContents,
          tools: specs.gemini,
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      payload = (await res.json()) as GeminiResponse;
    }

    return (
      getParts(payload)
        .map((p) => ('text' in p ? (p.text ?? '') : ''))
        .join('')
        .trim() || '(no content)'
    );
  }

  /**
   * Streams partial responses from Gemini, falling back to the non-streaming path if tools fire.
   */
  async sendStream(
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');

    const model = this.cfg?.model ?? 'gemini-1.5-flash';
    const base = this.cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const conversationId = store.getCurrentConversationId();

    // const systemPrompt = getToolSystemPrompt();

    const contents = toChatHistory(conversationId, history).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    // const systemInstruction = { role: 'system', parts: [{ text: systemPrompt }] };

    const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents }),
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

          const chunk = parts.map((p) => ('text' in p ? (p.text ?? '') : '')).join('');
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

/**
 * Pulls out the response parts from the primary Gemini candidate for easier processing.
 */
function getParts(response: GeminiResponse): GeminiPart[] {
  const candidate = response.candidates?.[0];
  return candidate?.content?.parts ?? [];
}

/**
 * Type guard that checks if a Gemini part contains a function call payload.
 */
function hasFunctionCall(part: GeminiPart): part is { functionCall: GeminiFunctionCall } {
  return 'functionCall' in part && !!part.functionCall;
}
