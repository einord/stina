import util from 'node:util';

import store from '@stina/store';

const TOOL_ARGS_MAX_LEN = 180;

export async function logToolInvocation(name: string, args: any) {
  try {
    const label = formatToolLabel(name, args);
    const argPreview = formatArgsPreview(args);
    const content = argPreview ? `Tool • ${label} • args: ${argPreview}` : `Tool • ${label}`;
    await store.appendMessage({ role: 'info', content });
  } catch (err) {
    console.warn('[tool] failed to append log message', err);
  }
}

export function formatConsoleLogPayload(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'value']) {
      if (typeof (value as any)[key] === 'string') {
        return (value as any)[key];
      }
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    if (json && json !== '{}') return json;
  } catch {}
  return util.inspect(value, { depth: 3, maxArrayLength: 20 });
}

function formatToolLabel(name: string, args: any): string {
  if (name === 'mcp_call') {
    const target = typeof args?.tool === 'string' ? args.tool : args?.name;
    const server = typeof args?.server === 'string' ? args.server : args?.url;
    if (target && server) return `${name} → ${target} @ ${server}`;
    if (target) return `${name} → ${target}`;
  }
  if (name === 'mcp_list' || name === 'list_tools') {
    const server = typeof args?.server === 'string' ? args.server : args?.source;
    if (server) return `${name} (${server})`;
  }
  return name;
}

function formatArgsPreview(args: any): string | undefined {
  if (args == null) return undefined;
  if (typeof args === 'string') {
    return args.length > TOOL_ARGS_MAX_LEN ? `${args.slice(0, TOOL_ARGS_MAX_LEN)}…` : args;
  }
  if (typeof args === 'number' || typeof args === 'boolean') {
    return String(args);
  }
  if (typeof args === 'object' && Object.keys(args).length === 0) {
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
