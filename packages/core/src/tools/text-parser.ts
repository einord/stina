/**
 * Tool call parser for extracting JSON-based tool calls from plain text responses.
 * Useful for smaller models that understand tool calling but don't format it correctly.
 */

export type ParsedToolCall = {
  name: string;
  parameters: Record<string, unknown>;
};

/**
 * Attempts to extract tool calls from text using multiple strategies.
 * Handles cases where models write JSON directly in their response.
 */
export function parseToolCallsFromText(text: string): ParsedToolCall[] {
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
 * Useful for displaying clean responses to users.
 */
export function stripToolCallsFromText(text: string): string {
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

/**
 * Checks if text contains what looks like a tool call.
 */
export function hasToolCallInText(text: string): boolean {
  return parseToolCallsFromText(text).length > 0;
}
