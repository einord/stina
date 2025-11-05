import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { encryptString, decryptString } from '@stina/crypto';

// Basic provider model
export type ProviderName = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface OpenAIConfig { apiKey?: string; baseUrl?: string | null; model?: string | null }
export interface AnthropicConfig { apiKey?: string; baseUrl?: string | null; model?: string | null }
export interface GeminiConfig { apiKey?: string; baseUrl?: string | null; model?: string | null }
export interface OllamaConfig { host?: string | null; model?: string | null }

export interface ProviderConfigs {
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  gemini?: GeminiConfig;
  ollama?: OllamaConfig;
}

export interface SettingsState {
  providers: ProviderConfigs;
  active?: ProviderName;
}

const defaultState: SettingsState = {
  providers: {},
  active: undefined,
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
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  // migrate legacy plaintext if present
  try {
    const legacyRaw = await fsp.readFile(legacy, 'utf8');
    const parsed = JSON.parse(legacyRaw) as SettingsState;
    await writeSettings(parsed);
    try { await fsp.unlink(legacy); } catch {}
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

export async function updateProvider(name: ProviderName, cfg: Partial<ProviderConfigs[ProviderName]>): Promise<SettingsState> {
  const s = await readSettings();
  const current = (s.providers[name] as any) ?? {};
  if (Object.prototype.hasOwnProperty.call(cfg as any, 'apiKey')) {
    const v: any = (cfg as any).apiKey;
    if (v === '') delete current.apiKey; else if (typeof v === 'string') current.apiKey = v;
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

export function sanitize(s: SettingsState) {
  const clone: any = JSON.parse(JSON.stringify(s));
  for (const p of ['openai','anthropic','gemini','ollama'] as const) {
    if (!clone.providers[p]) continue;
    if (clone.providers[p].apiKey) {
      clone.providers[p].hasKey = true;
      delete clone.providers[p].apiKey;
    }
  }
  return clone;
}
