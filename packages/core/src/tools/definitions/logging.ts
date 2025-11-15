import util from 'node:util';

import store from '@stina/store';

const TOOL_ARGS_MAX_LEN = 180;

type UnknownRecord = Record<string, unknown>;

/**
 * Persists a human-readable log message describing a tool invocation into the chat store.
 * Call from within tool dispatchers to give visibility into automated actions.
 * @param name Tool identifier being executed.
 * @param args Raw arguments passed to the tool.
 */
export async function logToolInvocation(name: string, args: unknown) {
  try {
    const label = formatToolLabel(name, args);
    const argPreview = formatArgsPreview(args);
    const content = argPreview ? `Tool • ${label} • args: ${argPreview}` : `Tool • ${label}`;
    await store.appendMessage({ role: 'tool', content });
  } catch (err) {
    console.warn('[tool] failed to append log message', err);
  }
}

/**
 * Normalizes arbitrary payloads into concise console-friendly strings.
 * Used by logging tools to show meaningful snippets regardless of input type.
 * @param value Any piece of data returned from a tool or MCP call.
 */
export function formatConsoleLogPayload(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    for (const key of ['text', 'content', 'value']) {
      const maybe = value[key];
      if (typeof maybe === 'string') return maybe;
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') return json;
  } catch {}
  return util.inspect(value, { depth: 3, maxArrayLength: 20 });
}

/**
 * Formats a short label describing the tool call, including target tool/server hints.
 */
function formatToolLabel(name: string, args: unknown): string {
  const record = isRecord(args) ? args : null;
  if (name === 'mcp_call') {
    const target = getString(record, 'tool') ?? getString(record, 'name');
    const server = getString(record, 'server') ?? getString(record, 'url');
    if (target && server) return `${name} → ${target} @ ${server}`;
    if (target) return `${name} → ${target}`;
  }
  if (name === 'mcp_list' || name === 'list_tools') {
    const server = getString(record, 'server') ?? getString(record, 'source');
    if (server) return `${name} (${server})`;
  }
  return name;
}

/**
 * Converts tool arguments into a limited-length preview string for logging.
 */
function formatArgsPreview(args: unknown): string | undefined {
  if (args == null) return undefined;
  if (typeof args === 'string') {
    return args.length > TOOL_ARGS_MAX_LEN ? `${args.slice(0, TOOL_ARGS_MAX_LEN)}…` : args;
  }
  if (typeof args === 'number' || typeof args === 'boolean') {
    return String(args);
  }
  if (isRecord(args) && Object.keys(args).length === 0) {
    return undefined;
  }
  try {
    const json = JSON.stringify(args);
    if (!json) return undefined;
    return json.length > TOOL_ARGS_MAX_LEN ? `${json.slice(0, TOOL_ARGS_MAX_LEN)}…` : json;
  } catch (err) {
    return String(args);
  }
}

/**
 * Type guard used to detect plain object records.
 */
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

/**
 * Safely extracts a string property from a record if it exists.
 */
function getString(record: UnknownRecord | null, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}
