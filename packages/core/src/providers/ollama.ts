import type { OllamaConfig } from '@stina/settings';
import { ChatMessage } from '@stina/store';

import { runTool, toolSpecs, toolSystemPrompt } from '../tools.js';
import { emitWarning } from '../warnings.js';

import { Provider } from './types.js';
import { normalizeToolArgs, toChatHistory } from './utils.js';

// ========================
// Text-based tool parsing
// ========================

type ParsedToolCall = {
  name: string;
  parameters: Record<string, unknown>;
};

/**
 * Attempts to extract tool calls from text using multiple strategies.
 * Handles cases where models write JSON directly in their response.
 */
function parseToolCallsFromText(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  // Strategy 1: Find JSON objects with "name" and "parameters" fields
  const jsonPattern = /\{[^{}]*"name"\s*:\s*"([^"]+)"[^{}]*"parameters"\s*:\s*(\{[^}]*\})[^{}]*\}/g;
  let match;

  while ((match = jsonPattern.exec(text)) !== null) {
    try {
      const fullJson = match[0];
      const parsed = JSON.parse(fullJson);
      if (parsed.name && parsed.parameters) {
        calls.push({
          name: parsed.name,
          parameters: parsed.parameters,
        });
      }
    } catch {
      // Failed to parse, try next match
    }
  }

  // Strategy 2: Find standalone JSON objects that look like tool calls
  const standaloneJsonPattern =
    /```json\s*(\{[\s\S]*?\})\s*```|(?:^|\n)\s*(\{[\s\S]*?\})\s*(?:\n|$)/g;

  while ((match = standaloneJsonPattern.exec(text)) !== null) {
    const jsonText = match[1] || match[2];
    if (!jsonText) continue;

    try {
      const parsed = JSON.parse(jsonText);
      if (parsed.name && (parsed.parameters || parsed.args || parsed.arguments)) {
        calls.push({
          name: parsed.name,
          parameters: parsed.parameters || parsed.args || parsed.arguments || {},
        });
      }
    } catch {
      // Failed to parse
    }
  }

  // Strategy 3: Look for markdown-style tool call blocks
  const markdownPattern = /```(?:tool|function)\s*\n([\s\S]*?)\n```/g;

  while ((match = markdownPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name) {
        calls.push({
          name: parsed.name,
          parameters: parsed.parameters || parsed.args || parsed.arguments || {},
        });
      }
    } catch {
      // Failed to parse
    }
  }

  // Remove duplicates based on name and stringified parameters
  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.name}:${JSON.stringify(call.parameters)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Removes tool call JSON from text, leaving only the conversational parts.
 */
function stripToolCallsFromText(text: string): string {
  let cleaned = text;

  // Remove JSON blocks
  cleaned = cleaned.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '');

  // Remove tool/function blocks
  cleaned = cleaned.replace(/```(?:tool|function)\s*\n[\s\S]*?\n```/g, '');

  // Remove standalone JSON that looks like tool calls
  cleaned = cleaned.replace(
    /\{[^{}]*"name"\s*:\s*"[^"]+"\s*,[^{}]*"parameters"\s*:\s*\{[^}]*\}[^{}]*\}/g,
    '',
  );

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

  return cleaned;
}

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

/**
 * Provider that talks to a local/remote Ollama server and supports optional tool use.
 */
export class OllamaProvider implements Provider {
  name = 'ollama';

  /**
   * @param cfg Host/model details loaded from user settings.
   */
  constructor(private cfg: OllamaConfig | undefined) {}

  /**
   * Executes a non-streaming chat request against Ollama, handling tool retries and warnings.
   */
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const historyMessages = toChatHistory(history).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    const requestBody = (includeTools: boolean) =>
      JSON.stringify({
        model,
        messages,
        stream: false,
        ...(includeTools ? { tools: toolSpecs.ollama } : {}),
      });

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
    const nativeToolCalls = toolsEnabled ? (assistantMessage?.tool_calls ?? []) : [];
    const responseText = assistantMessage?.content ?? '';

    // Try native tool calls first
    if (nativeToolCalls.length > 0) {
      const toolResults: ToolResult[] = [];
      for (const tc of nativeToolCalls) {
        const name = tc.function?.name;
        const rawArgs = tc.function?.arguments;
        console.debug('[ollama] native tool_call', name, rawArgs ?? '(no args)');

        if (!name) continue;
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
      return payload?.message?.content ?? '(no content)';
    }

    // Fallback: Check for text-based tool calls (for smaller models)
    const textToolCalls = parseToolCallsFromText(responseText);

    if (textToolCalls.length > 0) {
      console.debug('[ollama] detected text-based tool calls:', textToolCalls.length);

      const toolResults: { role: string; content: string }[] = [];
      for (const tc of textToolCalls) {
        console.debug('[ollama] text tool_call', tc.name, tc.parameters);

        const result = await runTool(tc.name, tc.parameters);
        toolResults.push({
          role: 'tool',
          content: `Tool ${tc.name} result: ${JSON.stringify(result)}`,
        });
      }

      // Clean the response text and add tool results
      const cleanedText = stripToolCallsFromText(responseText);
      const followUpMessages = [
        ...messages,
        { role: 'assistant', content: cleanedText || 'Executing tools...' },
        ...toolResults,
      ];

      res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: followUpMessages,
          stream: false,
          // Don't include tools in follow-up to get natural response
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      payload = (await res.json()) as OllamaResponse;
      return payload?.message?.content ?? '(no content)';
    }

    return responseText || '(no content)';
  }

  /**
   * Streams tokens from Ollama, retrying without tools when unsupported and delegating if calls appear.
   */
  async sendStream(
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';

    const historyMessages = toChatHistory(history).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const messages = [{ role: 'system', content: toolSystemPrompt }, ...historyMessages];

    const requestBody = (includeTools: boolean) =>
      JSON.stringify({
        model,
        messages,
        stream: true,
        ...(includeTools ? { tools: toolSpecs.ollama } : {}),
      });

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

          const chunkTools = toolsEnabled
            ? (chunk.message?.tool_calls ?? chunk.tool_calls ?? [])
            : [];
          if (Array.isArray(chunkTools) && chunkTools.length > 0) {
            return this.send(prompt, history);
          }
        } catch {
          // ignore parse errors for keep-alives
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
