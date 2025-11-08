import util from 'node:util';

import store from '@stina/store';

const TOOL_ARGS_MAX_LEN = 180;

type UnknownRecord = Record<string, unknown>;

export async function logToolInvocation(name: string, args: unknown) {
  try {
    const label = formatToolLabel(name, args);
    const argPreview = formatArgsPreview(args);
    const content = argPreview ? `Tool • ${label} • args: ${argPreview}` : `Tool • ${label}`;
    await store.appendMessage({ role: 'info', content });
  } catch (err) {
    console.warn('[tool] failed to append log message', err);
  }
}

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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function getString(record: UnknownRecord | null, key: string): string | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}
