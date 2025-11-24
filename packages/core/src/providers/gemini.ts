import { GoogleGenAI } from '@google/genai';
import type { GeminiConfig } from '@stina/settings';
import type { InteractionMessage } from '../../chat/index.js';

import { getToolSpecs, runTool } from '../tools.js';

import { Provider } from './types.js';
import { toChatHistory } from './utils.js';

/**
 * Provider implementation for Google's Gemini API using the official @google/genai SDK.
 * Supports both single-shot and streaming conversations with tool calling support.
 */
export class GeminiProvider implements Provider {
  name = 'gemini';
  private static readonly MAX_TOOL_FOLLOWUPS = 25;

  /**
   * @param cfg User configuration such as API key and model name.
   */
  constructor(private cfg: GeminiConfig | undefined) {}

  /**
   * Normalizes Gemini tool args (which are already objects) to the expected format.
   */
  private normalizeGeminiArgs(args?: unknown): Record<string, unknown> {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
    return args as Record<string, unknown>;
  }

  /**
   * Sends a single non-streaming request to Gemini, handling function calls automatically.
   * @param prompt Latest user message.
   * @param history Full chat history to include in the API request.
   */
  async send(prompt: string, history: InteractionMessage[]): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');

    const model = this.cfg?.model ?? 'gemini-2.5-flash';
    const conversationId = store.getCurrentConversationId();

    const specs = getToolSpecs();
    const ai = new GoogleGenAI({ apiKey: key });

    // Convert history to Gemini format (role: 'user' or 'model')
    const filteredHistory = toChatHistory(conversationId, history);

    let contents: unknown[] = filteredHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Gemini requires at least one message
    if (contents.length === 0) {
      throw new Error(
        'No messages in conversation history. This may indicate an issue with conversation state.',
      );
    }

    for (let attempt = 0; attempt < GeminiProvider.MAX_TOOL_FOLLOWUPS; attempt += 1) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            // The Gemini SDK expects tools to be an array of Tool objects.
            // If the type does not match, update ToolType to match the SDK's expected format.
            tools: specs.gemini as unknown as Array<object>,
          },
        });

        const candidates = response.candidates ?? [];
        if (!candidates.length) {
          console.warn(
            `[GeminiProvider] No candidates returned from Gemini API on attempt ${attempt + 1}. Response:`,
            response
          );
          continue;
        }

        const candidate = candidates[0];
        const parts = candidate.content?.parts ?? [];

        // Check for function calls
        const hasFunctionCalls = parts.some((p) => 'functionCall' in p && p.functionCall);

        if (hasFunctionCalls) {
          const functionCalls = parts.filter((p) => 'functionCall' in p && p.functionCall);

          // Execute all function calls
          const functionResponses = await Promise.all(
            functionCalls.map(async (fc) => {
              if (!('functionCall' in fc) || !fc.functionCall) {
                return { functionResponse: { name: '', response: {} } };
              }
              const name = fc.functionCall.name ?? '';
              const args = this.normalizeGeminiArgs(fc.functionCall.args);

              const result = await runTool(name, args);
              return {
                functionResponse: {
                  name,
                  response: result,
                },
              };
            }),
          );

          // Add assistant message with function calls and function responses to history
          contents = [
            ...contents,
            { role: 'model', parts },
            { role: 'user', parts: functionResponses },
          ];
          continue;
        }

        // No function calls, extract text response
        const text = parts
          .map((p: unknown) => {
            if (p && typeof p === 'object' && 'text' in p && typeof p.text === 'string') {
              return p.text;
            }
            return '';
          })
          .filter(Boolean)
          .join('')
          .trim();

        return text || '(no content)';
      } catch (error) {
        throw new Error(
          error instanceof Error ? `Gemini error: ${error.message}` : 'Gemini error',
        );
      }
    }

    throw new Error('Maximum tool follow-up iterations exceeded (25)');
  }

  /**
   * Streams partial responses from Gemini, falling back to send() if tools are detected.
   * @param prompt Latest user message.
   * @param history Previous conversation history.
   * @param onDelta Callback for partial text.
   * @param signal Optional abort signal from the caller.
   */
  async sendStream(
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    const key = this.cfg?.apiKey;
    if (!key) throw new Error('Gemini API key missing');

    const model = this.cfg?.model ?? 'gemini-2.5-flash';
    const conversationId = store.getCurrentConversationId();

    const ai = new GoogleGenAI({ apiKey: key });

    const filteredHistory = toChatHistory(conversationId, history);

    const contents = filteredHistory.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    // Gemini requires at least one message
    if (contents.length === 0) {
      throw new Error(
        'No messages in conversation history. This may indicate an issue with conversation state.',
      );
    }

    const specs = getToolSpecs();

    try {
      const response = await ai.models.generateContentStream({
        model,
        contents,
        config: { tools: specs.gemini as never },
      });

      let total = '';

      for await (const chunk of response) {

        // Check if stream is aborted
        if (signal?.aborted) {
          throw new Error('Stream aborted');
        }

        const candidates = chunk.candidates ?? [];
        if (!candidates.length) continue;

        const parts = candidates[0].content?.parts ?? [];

        // If function calls are detected, fall back to non-streaming
        const hasFunctionCalls = parts.some(
          (p) => p && typeof p === 'object' && 'functionCall' in p,
        );
        if (hasFunctionCalls) {
          return this.send(prompt, history);
        }

        // Extract and emit text
        const text = parts
          .map((p: unknown) => {
            if (p && typeof p === 'object' && 'text' in p && typeof p.text === 'string') {
              return p.text;
            }
            return '';
          })
          .filter(Boolean)
          .join('');

        if (text) {
          total += text;
          onDelta(text);
        }
      }

      return total || '(no content)';
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
      // Fall back to non-streaming on error
      return this.send(prompt, history);
    }
  }
}
