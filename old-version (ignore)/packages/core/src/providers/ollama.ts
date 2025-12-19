import type { InteractionMessage } from '@stina/chat';
import type { OllamaConfig } from '@stina/settings';

// import { getToolSpecs, getToolSystemPrompt, runTool } from '../tools.js';
import { getToolSpecs, runTool } from '../tools.js';
import {
  parseToolCallsFromText,
  stripToolCallsFromText,
} from '../tools/infrastructure/text-parser.js';
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
type ToolResult = { role: 'tool'; tool_call_id?: string; content: string; name?: string };

/**
 * Provider that talks to a local/remote Ollama server and supports optional tool use.
 */
export class OllamaProvider implements Provider {
  name = 'ollama';
  private static readonly MAX_TOOL_FOLLOWUPS = 25;

  /**
   * @param cfg Host/model details loaded from user settings.
   */
  constructor(private cfg: OllamaConfig | undefined) {}

  /**
   * Executes a non-streaming chat request against Ollama, handling tool retries and warnings.
   */
  async send(prompt: string, history: InteractionMessage[]): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const specs = getToolSpecs();
    // const systemPrompt = getToolSystemPrompt();

    type OllamaRequestMessage = {
      role: string;
      content: string;
      tool_calls?: OllamaToolCall[];
    };

    let messages: OllamaRequestMessage[] = toChatHistory(history).map((m) => ({
      role: m.role === 'instructions' ? 'user' : m.role,
      content: m.content,
    }));

    console.log(`[Ollama] Starting with ${messages.length} messages`);
    console.log('[Ollama] First message role before sending:', messages[0]?.role);
    console.log('[Ollama] First message from history:', history.at(0)?.role);

    for (let attempt = 0; attempt < OllamaProvider.MAX_TOOL_FOLLOWUPS; attempt += 1) {
      const data = { model, messages, tools: specs.ollama };
      console.log(
        `> [Ollama] Sending request (iteration ${attempt + 1}) with ${specs.ollama?.length ?? 0} tools`,
      );
      console.log(`> [Ollama] ${JSON.stringify(data)}`);

      let res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, stream: false }),
      });

      // Handle tools not supported by model
      if (!res.ok && res.status === 400) {
        emitWarning({
          type: 'tools-disabled',
          message: `Modellen "${model}" stöder inte verktyg. Fortsätter utan verktyg.`,
        });
        res = await fetch(`${host}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: false }),
        });
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[Ollama] Error ${res.status}:`, errorText);
        throw new Error(errorText ? `Ollama ${res.status}: ${errorText}` : `Ollama ${res.status}`);
      }

      const payload = (await res.json()) as OllamaResponse;
      const assistantMessage = payload?.message;
      if (!assistantMessage) {
        console.log('[ollama] No assistant message in response, continuing...');
        continue;
      }

      const nativeToolCalls = assistantMessage?.tool_calls ?? [];
      const responseText = assistantMessage?.content ?? '';
      console.log(
        `[ollama] Response text length: ${responseText.length}, tool calls: ${nativeToolCalls.length}`,
      );

      // Try native tool calls first
      if (nativeToolCalls.length > 0) {
        const toolResults: OllamaRequestMessage[] = [];
        for (const tc of nativeToolCalls) {
          const name = tc.function?.name;
          const rawArgs = tc.function?.arguments;
          console.log('[ollama] tool_call', name, rawArgs ?? '(no args)');

          if (!name) continue;
          const args = normalizeToolArgs(rawArgs);
          const result = await runTool(name, args);
          const toolResult = {
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: tc.id,
            name,
          } satisfies ToolResult;
          toolResults.push(toolResult);
          console.log('[ollama] tool_result', name, toolResult);
        }

        messages = [
          ...messages,
          {
            role: 'assistant',
            content: assistantMessage.content ?? '',
            tool_calls: nativeToolCalls,
          },
          ...toolResults,
        ];
        continue;
      }

      // Fallback: Check for text-based tool calls (for smaller models)
      const textToolCalls = parseToolCallsFromText(responseText);

      if (textToolCalls.length > 0) {
        console.log('[ollama] detected text-based tool calls:', textToolCalls.length);

        const toolResults: OllamaRequestMessage[] = [];
        for (const tc of textToolCalls) {
          console.log('[ollama] text tool_call', tc.name, tc.parameters);

          const result = await runTool(tc.name, tc.parameters);
          toolResults.push({
            role: 'tool',
            content: `Tool ${tc.name} result: ${JSON.stringify(result)}`,
          });
        }

        // Clean the response text and add tool results
        const cleanedText = stripToolCallsFromText(responseText);
        messages = [
          ...messages,
          { role: 'assistant', content: cleanedText || 'Executing tools...' },
          ...toolResults,
        ];
        continue;
      }

      // No tool calls, return the content
      return responseText || '(no content)';
    }

    return '(no content)';
  }

  /**
   * Streams tokens from Ollama, retrying without tools when unsupported and delegating if calls appear.
   */
  async sendStream(
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const specs = getToolSpecs();
    // const systemPrompt = getToolSystemPrompt();

    const historyMessages = toChatHistory(history).map((m) => ({
      role: m.role === 'instructions' ? 'user' : m.role,
      content: m.content,
    }));
    // const messages = [{ role: 'system', content: systemPrompt }, ...historyMessages];
    const messages = historyMessages;

    const data = { model, messages, stream: true };
    console.log(`> [Ollama] ${JSON.stringify(data)}`);
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
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
        let trimmed = line.trim();
        if (!trimmed) continue;

        // Ollama streams SSE responses prefixed with "data:"; strip it before parsing JSON.
        if (trimmed.startsWith('data:')) {
          trimmed = trimmed.slice(5).trimStart();
          if (!trimmed) continue;
        }

        // Ignore SSE metadata lines such as "event:" or "id:".
        if (trimmed.startsWith('event:') || trimmed.startsWith('id:')) {
          continue;
        }

        // Ollama uses the OpenAI-style "[DONE]" sentinel when streaming tools.
        if (trimmed === '[DONE]') {
          continue;
        }

        try {
          const chunk = JSON.parse(trimmed) as OllamaStreamChunk;
          const delta = chunk.message?.content ?? chunk.response ?? '';
          if (delta) {
            total += delta;
            onDelta(delta);
          }

          const chunkTools = chunk.message?.tool_calls ?? chunk.tool_calls ?? [];
          if (Array.isArray(chunkTools) && chunkTools.length > 0) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore SSE keep-alive lines
        }
      }
    }

    // After streaming is complete, check if the response contains text-based tool calls
    const textToolCalls = parseToolCallsFromText(total);
    if (textToolCalls.length > 0) {
      console.debug('[ollama stream] detected text-based tool calls, switching to send()');
      return this.send(prompt, history);
    }

    return total || '(no content)';
  }
}
