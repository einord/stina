import type { OllamaConfig } from '@stina/settings';
import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { emitWarning } from '../warnings.js';
import { Provider } from './types.js';
import { normalizeToolArgs, toChatHistory } from './utils.js';

type OllamaFunctionCall = { name?: string; arguments?: string };
type OllamaToolCall = { id?: string; function?: OllamaFunctionCall };
type OllamaMessage = { content?: string; tool_calls?: OllamaToolCall[] };
type OllamaResponse = { message?: OllamaMessage };
type OllamaStreamChunk = {
  message?: OllamaMessage;
  response?: string;
  tool_calls?: OllamaToolCall[];
};
type ToolResult = { role: 'tool'; tool_call_id?: string; content: string };

export class OllamaProvider implements Provider {
  name = 'ollama';

  constructor(private cfg: OllamaConfig | undefined) {}

  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const historyMessages = toChatHistory(history).map((m) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    const requestBody = (includeTools: boolean) =>
      JSON.stringify({ model, messages, stream: false, ...(includeTools ? { tools: toolSpecs.ollama } : {}) });

    let toolsEnabled = true;
    let res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody(toolsEnabled),
    });

    if (!res.ok && res.status === 400) {
      toolsEnabled = false;
      emitWarning({
        type: 'tools-disabled',
        message: `Modellen "${model}" stöder inte verktyg. Fortsätter utan verktyg.`,
      });
      res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody(toolsEnabled),
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text ? `Ollama ${res.status}: ${text}` : `Ollama ${res.status}`);
    }

    let payload = (await res.json()) as OllamaResponse;
    const assistantMessage = payload?.message;
    const toolCalls = toolsEnabled ? assistantMessage?.tool_calls ?? [] : [];

    if (toolCalls.length > 0) {
      const toolResults: ToolResult[] = [];
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        const rawArgs = tc.function?.arguments;
        console.debug('[ollama] tool_call', name, rawArgs ?? '(no args)');

        const args = normalizeToolArgs(rawArgs);
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
      payload = (await res.json()) as OllamaResponse;
    }

    return payload?.message?.content ?? '(no content)';
  }

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

    const requestBody = (includeTools: boolean) =>
      JSON.stringify({ model, messages, stream: true, ...(includeTools ? { tools: toolSpecs.ollama } : {}) });

    let toolsEnabled = true;
    let res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody(toolsEnabled),
      signal,
    });

    if (!res.ok && res.status === 400) {
      toolsEnabled = false;
      emitWarning({
        type: 'tools-disabled',
        message: `Modellen "${model}" stöder inte verktyg. Fortsätter utan verktyg.`,
      });
      res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody(toolsEnabled),
        signal,
      });
    }

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
          const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          const delta = chunk.message?.content ?? chunk.response ?? '';
          if (delta) {
            total += delta;
            onDelta(delta);
          }

          const chunkTools = toolsEnabled ? chunk.message?.tool_calls ?? chunk.tool_calls ?? [] : [];
          if (Array.isArray(chunkTools) && chunkTools.length > 0) {
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
