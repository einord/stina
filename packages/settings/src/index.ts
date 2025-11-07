import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { decryptString, encryptString } from '@stina/crypto';

// Basic provider model
export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface OpenAIConfig {
  apiKey?: string;
  baseUrl?: string | null;
  model?: string | null;
}
export interface AnthropicConfig {
  apiKey?: string;
  baseUrl?: string | null;
  model?: string | null;
}
export interface GeminiConfig {
  apiKey?: string;
  baseUrl?: string | null;
  model?: string | null;
}
export interface OllamaConfig {
  host?: string | null;
  model?: string | null;
}

export interface ProviderConfigs {
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  gemini?: GeminiConfig;
  ollama?: OllamaConfig;
}

export interface MCPServer {
  name: string;
  url: string;
}
export interface SettingsState {
  providers: ProviderConfigs;
  active?: ProviderName;
  mcp?: {
    servers: MCPServer[];
    defaultServer?: string;
  };
}

const defaultState: SettingsState = {
  providers: {},
  active: undefined,
  mcp: { servers: [], defaultServer: undefined },
};

function getSettingsPath() {
  const dir = path.join(os.homedir(), '.stina');
  const file = path.join(dir, 'settings.enc');
  const legacy = path.join(dir, 'settings.json');
  return { dir, file, legacy };
}

async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function readSettings(): Promise<SettingsState> {
  const { dir, file, legacy } = getSettingsPath();
  await ensureDir(dir);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const json = await decryptString(raw);
    const parsed = JSON.parse(json) as SettingsState;
    if (parsed && typeof parsed === 'object') {
      if (!parsed.mcp) parsed.mcp = { servers: [], defaultServer: undefined };
      return parsed;
    }
  } catch {}
  // migrate legacy plaintext if present
  try {
    const legacyRaw = await fsp.readFile(legacy, 'utf8');
    const parsed = JSON.parse(legacyRaw) as SettingsState;
    await writeSettings(parsed);
    try {
      await fsp.unlink(legacy);
    } catch {}
    return parsed;
  } catch {}
  await writeSettings(defaultState);
  return { ...defaultState };
}

export async function writeSettings(s: SettingsState): Promise<void> {
  const { dir, file } = getSettingsPath();
  await ensureDir(dir);
  const payload = await encryptString(JSON.stringify(s));
  await fsp.writeFile(file, payload, 'utf8');
}

export async function updateProvider(
  name: ProviderName,
  cfg: Partial<ProviderConfigs[ProviderName]>,
): Promise<SettingsState> {
  const s = await readSettings();
  const current = (s.providers[name] as any) ?? {};
  if (Object.prototype.hasOwnProperty.call(cfg as any, 'apiKey')) {
    const v: any = (cfg as any).apiKey;
    if (v === '') delete current.apiKey;
    else if (typeof v === 'string') current.apiKey = v;
  }
  for (const k of Object.keys(cfg as any)) {
    if (k === 'apiKey') continue;
    (current as any)[k] = (cfg as any)[k];
  }
  s.providers[name] = current;
  await writeSettings(s);
  return s;
}

export async function setActiveProvider(name: ProviderName | undefined): Promise<SettingsState> {
  const s = await readSettings();
  s.active = name;
  await writeSettings(s);
  return s;
}

// MCP helpers
export async function listMCPServers() {
  const s = await readSettings();
  return s.mcp ?? { servers: [], defaultServer: undefined };
}

export async function upsertMCPServer(server: MCPServer) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  const i = s.mcp.servers.findIndex((x) => x.name === server.name);
  if (i >= 0) s.mcp.servers[i] = server;
  else s.mcp.servers.push(server);
  await writeSettings(s);
  return s.mcp;
}

export async function removeMCPServer(name: string) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  s.mcp.servers = s.mcp.servers.filter((x) => x.name !== name);
  if (s.mcp.defaultServer === name) s.mcp.defaultServer = undefined;
  await writeSettings(s);
  return s.mcp;
}

export async function setDefaultMCPServer(name: string | undefined) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  s.mcp.defaultServer = name;
  await writeSettings(s);
  return s.mcp;
}

export async function resolveMCPServer(input?: string): Promise<string> {
  const s = await readSettings();
  const conf = s.mcp ?? { servers: [], defaultServer: undefined };
  // accept local shortcut
  if (input === 'local' || (!input && conf.defaultServer === 'local')) return 'local://builtin';
  if (!input || !/^wss?:\/\//.test(input)) {
    const name = input ?? conf.defaultServer;
    if (!name) throw new Error('No MCP server provided and no default set');
    if (name === 'local') return 'local://builtin';
    const item = conf.servers.find((x) => x.name === name);
    if (!item) throw new Error(`Unknown MCP server name: ${name}`);
    return item.url;
  }
  return input;
}

export function sanitize(s: SettingsState) {
  const clone: any = JSON.parse(JSON.stringify(s));
  for (const p of ['openai', 'anthropic', 'gemini', 'ollama'] as const) {
    if (!clone.providers[p]) continue;
    if (clone.providers[p].apiKey) {
      clone.providers[p].hasKey = true;
      delete clone.providers[p].apiKey;
    }
  }
  return clone;
}
