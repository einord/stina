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

export type MCPServerType = 'websocket' | 'stdio';

export interface MCPOAuthTokens {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
  receivedAt?: number;
}

export interface MCPOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scope?: string;
  redirectUri?: string;
  headerName?: string;
  sendRawAccessToken?: boolean;
  tokens?: MCPOAuthTokens;
  hasClientSecret?: boolean;
  tokenStatus?: {
    hasAccessToken: boolean;
    expiresAt?: number;
  };
}

export interface MCPServer {
  name: string;
  type: MCPServerType;
  url?: string; // For websocket servers
  command?: string; // For stdio servers
  oauth?: MCPOAuthConfig;
}

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface DesktopSettings {
  windowBounds?: WindowBounds;
  todoPanelOpen?: boolean;
  todoPanelWidth?: number;
  language?: string;
}

export interface AdvancedSettings {
  debugMode?: boolean;
}

export type PersonalityPreset =
  | 'friendly'
  | 'concise'
  | 'sarcastic'
  | 'professional'
  | 'informative'
  | 'custom';

export interface PersonalitySettings {
  preset?: PersonalityPreset;
  customText?: string;
}

export interface TodoSettings {
  /**
   * Default reminder in minutes for timepoint todos. Null/undefined => no auto reminder.
   */
  defaultReminderMinutes?: number | null;
  /**
   * Default time (HH:MM) for daily all-day reminders.
   */
  allDayReminderTime?: string | null;
  /**
   * Timestamp (ms) of the last time the daily all-day reminder was sent.
   * Used to avoid sending duplicates across app restarts.
   */
  lastAllDayReminderAt?: number | null;
}

export interface UserProfile {
  firstName?: string;
  nickname?: string;
}

export interface SettingsState {
  providers: ProviderConfigs;
  active?: ProviderName;
  mcp?: {
    servers: MCPServer[];
    defaultServer?: string;
  };
  desktop?: DesktopSettings;
  advanced?: AdvancedSettings;
  userProfile?: UserProfile;
  personality?: PersonalitySettings;
  todos?: TodoSettings;
}

const TODO_DEFAULTS: TodoSettings = {
  defaultReminderMinutes: null,
  allDayReminderTime: '09:00',
  lastAllDayReminderAt: null,
};

const defaultState: SettingsState = {
  providers: {},
  active: undefined,
  mcp: { servers: [], defaultServer: undefined },
  desktop: {},
  advanced: { debugMode: false },
  userProfile: { firstName: undefined, nickname: undefined },
  personality: { preset: 'professional', customText: '' },
  todos: { ...TODO_DEFAULTS },
};

const OAUTH_EXPIRY_SKEW_MS = 60 * 1000;
const DEFAULT_AUTH_HEADER = 'Authorization';
const DEFAULT_TOKEN_TYPE = 'Bearer';

/**
 * Builds the canonical paths for the encrypted settings files inside ~/.stina.
 * Use whenever you need to read/write the settings payload on disk.
 */
function getSettingsPath() {
  const dir = path.join(os.homedir(), '.stina');
  const file = path.join(dir, 'settings.enc');
  const legacy = path.join(dir, 'settings.json');
  return { dir, file, legacy };
}

function mergeOAuthConfig(
  current?: MCPOAuthConfig,
  updates?: MCPOAuthConfig,
): MCPOAuthConfig | undefined {
  if (!current && !updates) return undefined;
  if (!current) return cleanOAuthConfig(updates);
  if (!updates) return cleanOAuthConfig({ ...current });
  const next: MCPOAuthConfig = {
    ...current,
    ...updates,
    tokens: mergeOAuthTokens(current.tokens, updates.tokens),
  };
  return cleanOAuthConfig(next);
}

function mergeOAuthTokens(
  current?: MCPOAuthTokens,
  updates?: MCPOAuthTokens,
): MCPOAuthTokens | undefined {
  if (!current && !updates) return undefined;
  if (!updates) return current ? { ...current } : undefined;
  return { ...(current ?? {}), ...updates };
}

function cleanOAuthConfig(config?: MCPOAuthConfig): MCPOAuthConfig | undefined {
  if (!config) return undefined;
  const next: MCPOAuthConfig = { ...config };
  if (next.clientSecret === '') delete next.clientSecret;
  if (next.authorizationUrl === '') delete next.authorizationUrl;
  if (next.tokenUrl === '') delete next.tokenUrl;
  if (next.scope === '') delete next.scope;
  if (next.redirectUri === '') delete next.redirectUri;
  if (next.headerName === '') delete next.headerName;
  delete next.hasClientSecret;
  delete next.tokenStatus;
  return next;
}

/**
 * Ensures that the provided directory exists before touching the file system.
 * Always call this prior to persisting data under ~/.stina.
 */
async function ensureDir(dir: string) {
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Decrypts and returns the current settings object, migrating legacy formats when found.
 * Call this before accessing provider, MCP or desktop configuration.
 */
export async function readSettings(): Promise<SettingsState> {
  const { dir, file, legacy } = getSettingsPath();
  await ensureDir(dir);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const json = await decryptString(raw);
    const parsed = JSON.parse(json) as SettingsState;
    if (parsed && typeof parsed === 'object') {
      if (!parsed.mcp) parsed.mcp = { servers: [], defaultServer: undefined };
      if (!parsed.desktop) parsed.desktop = {};
      if (!parsed.userProfile) parsed.userProfile = { firstName: undefined, nickname: undefined };
      if (!parsed.personality) parsed.personality = { preset: 'professional', customText: '' };
      if (!parsed.todos) parsed.todos = { defaultReminderMinutes: null, allDayReminderTime: '09:00' };
      const legacyPreset = (parsed.personality?.preset as string | undefined) ?? undefined;
      if (legacyPreset === 'dry') parsed.personality.preset = 'professional';
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

/**
 * Persists the provided settings state by encrypting it to ~/.stina/settings.enc.
 * Invoke after every mutation to guarantee other processes read the latest config.
 */
export async function writeSettings(s: SettingsState): Promise<void> {
  const { dir, file } = getSettingsPath();
  await ensureDir(dir);
  const payload = await encryptString(JSON.stringify(s));
  await fsp.writeFile(file, payload, 'utf8');
}

/**
 * Merges provider-specific configuration (api keys, models, etc) into the stored settings.
 * Use this from UI flows or scripts that let users configure an individual provider.
 * @param name Provider identifier, e.g. `openai`.
 * @param cfg Partial config fields that should be overridden for that provider.
 */
export async function updateProvider<T extends ProviderName>(
  name: T,
  cfg: Partial<ProviderConfigs[T]>,
): Promise<SettingsState> {
  const s = await readSettings();
  const current = { ...(s.providers[name] ?? {}) } as ProviderConfigs[T];
  const target = current as Record<string, unknown>;
  const updates = cfg as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(updates, 'apiKey')) {
    const value = updates.apiKey;
    if (typeof value === 'string') {
      target['apiKey'] = value;
    } else if (value === '') {
      delete target['apiKey'];
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'apiKey') continue;
    // Only update fields that have actual values (not undefined, null, or empty string)
    if (value !== undefined && value !== null && value !== '') {
      target[key] = value;
    } else if (value === '') {
      // Empty string means delete the field
      delete target[key];
    }
  }
  s.providers[name] = current;
  await writeSettings(s);
  return s;
}

/**
 * Marks which provider should be used by default by storing its name in settings.
 * Call this when the UI toggles the active provider for new chat sessions.
 */
export async function setActiveProvider(name: ProviderName | undefined): Promise<SettingsState> {
  const s = await readSettings();
  s.active = name;
  await writeSettings(s);
  return s;
}

// MCP helpers
/**
 * Returns all configured MCP servers with the currently selected default.
 * Helpful when rendering server pickers or syncing settings to clients.
 */
export async function listMCPServers() {
  const s = await readSettings();
  return s.mcp ?? { servers: [], defaultServer: undefined };
}

/**
 * Inserts or updates one MCP server definition and persists the change.
 * Use whenever a server form is submitted or scripts register a new endpoint.
 * @param server Object containing name and URL for the server.
 */
export async function upsertMCPServer(server: MCPServer) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  const i = s.mcp.servers.findIndex((x) => x.name === server.name);
  if (i >= 0) {
    const existing = s.mcp.servers[i];
    const next: MCPServer = {
      ...existing,
      ...server,
      oauth: mergeOAuthConfig(existing.oauth, server.oauth),
    };
    s.mcp.servers[i] = next;
  } else {
    s.mcp.servers.push({ ...server, oauth: mergeOAuthConfig(undefined, server.oauth) });
  }
  await writeSettings(s);
  return s.mcp;
}

/**
 * Removes a server from the MCP list and clears the default if it matched the removed one.
 * Call this when a user deletes an endpoint from settings.
 * @param name Server name to remove.
 */
export async function removeMCPServer(name: string) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  s.mcp.servers = s.mcp.servers.filter((x) => x.name !== name);
  if (s.mcp.defaultServer === name) s.mcp.defaultServer = undefined;
  await writeSettings(s);
  return s.mcp;
}

/**
 * Sets the default MCP server name so future operations can resolve it implicitly.
 * Use when a user picks which server should be preferred.
 * @param name Optional name to mark as default.
 */
export async function setDefaultMCPServer(name: string | undefined) {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  s.mcp.defaultServer = name;
  await writeSettings(s);
  return s.mcp;
}

/**
 * Reads the last persisted desktop window bounds so the Electron shell can restore its position.
 * Use on startup before creating the BrowserWindow.
 */
export async function getWindowBounds(): Promise<WindowBounds | undefined> {
  const s = await readSettings();
  return s.desktop?.windowBounds;
}

/**
 * Saves the latest window size and position for the desktop client.
 * Call this whenever the Electron window moves/resizes to keep the UX consistent.
 * @param bounds The full set of BrowserWindow bounds to persist.
 */
export async function saveWindowBounds(bounds: WindowBounds): Promise<WindowBounds> {
  const s = await readSettings();
  if (!s.desktop) s.desktop = {};
  s.desktop.windowBounds = bounds;
  await writeSettings(s);
  return bounds;
}

/**
 * Reads the current todo panel visibility state from settings.
 * Use on desktop app startup to restore the last known panel state.
 */
export async function getTodoPanelOpen(): Promise<boolean> {
  const s = await readSettings();
  return s.desktop?.todoPanelOpen ?? false;
}

/**
 * Saves the todo panel visibility state to settings.
 * Call this whenever the user toggles the todo panel to persist the preference.
 * @param isOpen Whether the todo panel is currently visible.
 */
export async function setTodoPanelOpen(isOpen: boolean): Promise<boolean> {
  const s = await readSettings();
  if (!s.desktop) s.desktop = {};
  s.desktop.todoPanelOpen = isOpen;
  await writeSettings(s);
  return isOpen;
}

/**
 * Retrieves the saved todo panel width from settings.
 * Use on desktop app startup to restore the last known panel width.
 * @returns The saved width in pixels, or 320 (default) if not set.
 */
export async function getTodoPanelWidth(): Promise<number> {
  const s = await readSettings();
  return s.desktop?.todoPanelWidth ?? 320;
}

/**
 * Saves the todo panel width to settings.
 * Call this whenever the user resizes the todo panel to persist the preference.
 * @param width The new width in pixels.
 */
export async function setTodoPanelWidth(width: number): Promise<number> {
  const s = await readSettings();
  if (!s.desktop) s.desktop = {};
  s.desktop.todoPanelWidth = width;
  await writeSettings(s);
  return width;
}

/**
 * Returns todo-specific defaults (reminders/timepoints).
 */
export async function getTodoSettings(): Promise<TodoSettings> {
  const s = await readSettings();
  s.todos = { ...TODO_DEFAULTS, ...(s.todos ?? {}) };
  return { ...s.todos };
}

/**
 * Updates todo-specific defaults (reminders/timepoints).
 * @param updates Partial todo settings to merge.
 */
export async function updateTodoSettings(updates: Partial<TodoSettings>): Promise<TodoSettings> {
  const s = await readSettings();
  s.todos = { ...TODO_DEFAULTS, ...(s.todos ?? {}), ...updates };
  await writeSettings(s);
  return { ...s.todos };
}

/**
 * Resolves a server identifier (name or URL) into a concrete MCP URL, honoring defaults.
 * Helpful when wiring IPC handlers that allow both names and URLs from the UI.
 * @param input Optional name or URL provided by the user.
 */
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
    if (item.type === 'websocket' && item.url) return item.url;
    throw new Error(`Server ${name} is not a websocket server`);
  }
  return input;
}

/**
 * Resolves a server identifier into a full MCPServer object.
 * Returns server configuration including type, url, and command.
 * @param input Optional name provided by the user.
 */
export async function resolveMCPServerConfig(input?: string): Promise<MCPServer> {
  const s = await readSettings();
  const conf = s.mcp ?? { servers: [], defaultServer: undefined };

  // Handle local builtin
  if (input === 'local' || (!input && conf.defaultServer === 'local')) {
    return { name: 'local', type: 'websocket', url: 'local://builtin' };
  }

  const name = input ?? conf.defaultServer;
  if (!name) throw new Error('No MCP server provided and no default set');

  if (name === 'local') {
    return { name: 'local', type: 'websocket', url: 'local://builtin' };
  }

  const item = conf.servers.find((x) => x.name === name);
  if (!item) throw new Error(`Unknown MCP server name: ${name}`);
  let mutated = false;
  if (item.oauth) {
    mutated = await maybeRefreshMcpOAuthTokens(item);
  }
  if (mutated) {
    await writeSettings(s);
  }
  return JSON.parse(JSON.stringify(item)) as MCPServer;
}

/**
 * Updates the advanced settings (debug mode, etc.).
 * @param advanced Partial advanced settings to merge.
 */
export async function updateAdvancedSettings(advanced: Partial<AdvancedSettings>): Promise<void> {
  const s = await readSettings();
  if (!s.advanced) s.advanced = {};
  Object.assign(s.advanced, advanced);
  await writeSettings(s);
}

/**
 * Gets the current debug mode setting.
 */
export async function getDebugMode(): Promise<boolean> {
  const s = await readSettings();
  return s.advanced?.debugMode ?? false;
}

/**
 * Sets the debug mode setting.
 * @param enabled Whether debug mode should be enabled.
 */
export async function setDebugMode(enabled: boolean): Promise<void> {
  await updateAdvancedSettings({ debugMode: enabled });
}

/**
 * Produces a sanitized clone of settings where sensitive values (API keys) are stripped.
 * Use this before sending settings to renderers or logs.
 * @param s Settings state to sanitize.
 */
export function sanitize(s: SettingsState): SettingsState {
  const clone = JSON.parse(JSON.stringify(s)) as SettingsState;
  for (const p of ['openai', 'anthropic', 'gemini', 'ollama'] as const) {
    const provider = clone.providers[p] as Record<string, unknown> | undefined;
    if (!provider) continue;
    const apiKey = provider['apiKey'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      provider['hasKey'] = true;
      delete provider['apiKey'];
    }
  }
  if (clone.mcp?.servers) {
    clone.mcp.servers = clone.mcp.servers.map((server) => sanitizeMcpServer(server));
  }
  if (!clone.personality) {
    clone.personality = { preset: 'professional', customText: '' };
  }
  return clone;
}

/**
 * Updates the user profile settings (first name and nickname).
 * Use this from UI flows that allow users to set their personal information.
 * @param profile Partial profile fields to update.
 */
export async function updateUserProfile(profile: Partial<UserProfile>): Promise<UserProfile> {
  const s = await readSettings();
  if (!s.userProfile) s.userProfile = { firstName: undefined, nickname: undefined };
  if (profile.firstName !== undefined) s.userProfile.firstName = profile.firstName;
  if (profile.nickname !== undefined) s.userProfile.nickname = profile.nickname;
  await writeSettings(s);
  return s.userProfile;
}

/**
 * Reads the current user profile from settings.
 * Use this when you need to display or use the user's name in the application.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const s = await readSettings();
  return s.userProfile ?? { firstName: undefined, nickname: undefined };
}

/**
 * Updates personality presets/custom instructions used by the assistant.
 */
export async function updatePersonality(settings: Partial<PersonalitySettings>): Promise<PersonalitySettings> {
  const s = await readSettings();
  if (!s.personality) s.personality = { preset: 'professional', customText: '' };
  s.personality = { ...s.personality, ...settings };
  await writeSettings(s);
  return s.personality;
}

/**
 * Returns the current personality configuration (preset + custom text).
 */
export async function getPersonality(): Promise<PersonalitySettings> {
  const s = await readSettings();
  return s.personality ?? { preset: 'professional', customText: '' };
}

/**
 * Gets the saved language preference from settings.
 * Use on app startup to restore the user's language choice.
 * @returns The saved language code (e.g., 'en', 'sv'), or undefined if not set.
 */
export async function getLanguage(): Promise<string | undefined> {
  const s = await readSettings();
  return s.desktop?.language;
}

/**
 * Saves the language preference to settings.
 * Call this whenever the user changes their language preference.
 * @param language The language code to save (e.g., 'en', 'sv').
 */
export async function setLanguage(language: string): Promise<string> {
  const s = await readSettings();
  if (!s.desktop) s.desktop = {};
  s.desktop.language = language;
  await writeSettings(s);
  return language;
}

function sanitizeMcpServer(server: MCPServer): MCPServer {
  if (!server.oauth) return server;
  if (server.oauth.clientSecret) {
    server.oauth.hasClientSecret = true;
    delete server.oauth.clientSecret;
  }
  if (server.oauth.tokens) {
    const status = {
      hasAccessToken: Boolean(server.oauth.tokens.accessToken),
      expiresAt: server.oauth.tokens.expiresAt,
    };
    server.oauth.tokenStatus = status;
    delete server.oauth.tokens;
  }
  return server;
}

/**
 * Persists the latest OAuth token response for a given MCP server.
 * Use this after completing an authorization_code flow so future requests can reuse the token.
 * @param serverName Target MCP server name.
 * @param response Raw token endpoint response (JSON object).
 */
export async function applyMcpOAuthResponse(
  serverName: string,
  response: unknown,
): Promise<MCPServer> {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  const target = s.mcp.servers.find((srv) => srv.name === serverName);
  if (!target) throw new Error(`Unknown MCP server: ${serverName}`);
  if (!target.oauth) target.oauth = {};
  target.oauth.tokens = normalizeTokenResponse(response, target.oauth.tokens);
  await writeSettings(s);
  return JSON.parse(JSON.stringify(target)) as MCPServer;
}

/**
 * Exchanges an authorization code for tokens and persists them for the given server.
 * Use this after completing the OAuth browser redirect.
 * @param serverName Target MCP server name.
 * @param code Authorization code returned from the provider.
 * @param codeVerifier Original PKCE code verifier string.
 */
export async function exchangeMcpAuthorizationCode(
  serverName: string,
  code: string,
  codeVerifier: string,
): Promise<MCPServer> {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  const target = s.mcp.servers.find((srv) => srv.name === serverName);
  if (!target || !target.oauth)
    throw new Error(`Unknown MCP server or OAuth config missing: ${serverName}`);
  if (!target.oauth.tokenUrl) throw new Error(`Server ${serverName} is missing oauth.tokenUrl`);
  if (!target.oauth.clientId) throw new Error(`Server ${serverName} is missing oauth.clientId`);
  const redirectUri = target.oauth.redirectUri;
  if (!redirectUri) throw new Error(`Server ${serverName} is missing oauth.redirectUri`);

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: target.oauth.clientId,
    code_verifier: codeVerifier,
  });
  if (target.oauth.clientSecret) params.set('client_secret', target.oauth.clientSecret);
  if (target.oauth.scope) params.set('scope', target.oauth.scope);

  const updated = await requestOAuthTokens(target.oauth.tokenUrl, params);
  target.oauth.tokens = updated;
  await writeSettings(s);
  return JSON.parse(JSON.stringify(target)) as MCPServer;
}

/**
 * Clears all persisted OAuth tokens for the specified MCP server.
 * Useful when the user disconnects or when refresh attempts start failing.
 * @param serverName Target MCP server name.
 */
export async function clearMcpOAuthTokens(serverName: string): Promise<void> {
  const s = await readSettings();
  if (!s.mcp) s.mcp = { servers: [], defaultServer: undefined };
  const target = s.mcp.servers.find((srv) => srv.name === serverName);
  if (!target || !target.oauth) return;
  delete target.oauth.tokens;
  await writeSettings(s);
}

/**
 * Builds optional HTTP headers for MCP websocket connections based on stored OAuth tokens.
 * Returns undefined if the server has no valid tokens.
 * @param server Server configuration resolved through resolveMCPServerConfig.
 */
export function buildMcpAuthHeaders(server: MCPServer): Record<string, string> | undefined {
  const token = server.oauth?.tokens?.accessToken;
  if (!token) return undefined;
  const headerName = server.oauth?.headerName?.trim() || DEFAULT_AUTH_HEADER;
  const tokenType = server.oauth?.tokens?.tokenType?.trim() || DEFAULT_TOKEN_TYPE;
  const value = server.oauth?.sendRawAccessToken ? token : `${tokenType} ${token}`.trim();
  return { [headerName]: value };
}

async function maybeRefreshMcpOAuthTokens(server: MCPServer): Promise<boolean> {
  if (!server.oauth || !server.oauth.tokenUrl || !server.oauth.tokens) {
    return false;
  }
  if (!needsTokenRefresh(server.oauth.tokens)) {
    return false;
  }
  const refreshToken = server.oauth.tokens.refreshToken;
  if (!refreshToken) {
    return false;
  }
  if (!server.oauth.clientId) {
    console.warn('[settings] Missing clientId for MCP OAuth refresh on', server.name);
    return false;
  }
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: server.oauth.clientId,
  });
  if (server.oauth.clientSecret) params.set('client_secret', server.oauth.clientSecret);
  if (server.oauth.scope) params.set('scope', server.oauth.scope);
  if (server.oauth.redirectUri) params.set('redirect_uri', server.oauth.redirectUri);

  try {
    const updated = await requestOAuthTokens(server.oauth.tokenUrl, params, server.oauth.tokens);
    server.oauth.tokens = updated;
    return true;
  } catch (err) {
    console.warn('[settings] Failed to refresh MCP OAuth token for', server.name, err);
    return false;
  }
}

function needsTokenRefresh(tokens?: MCPOAuthTokens): boolean {
  if (!tokens || !tokens.accessToken) return true;
  if (!tokens.expiresAt) return false;
  const now = Date.now();
  return now + OAUTH_EXPIRY_SKEW_MS >= tokens.expiresAt;
}

async function requestOAuthTokens(
  tokenUrl: string,
  params: URLSearchParams,
  previous?: MCPOAuthTokens,
): Promise<MCPOAuthTokens> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `OAuth token request failed (${res.status} ${res.statusText || ''}) - ${JSON.stringify(payload)}`,
    );
  }
  return normalizeTokenResponse(payload, previous);
}

function normalizeTokenResponse(payload: unknown, previous?: MCPOAuthTokens): MCPOAuthTokens {
  const record =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const now = Date.now();
  const accessToken =
    typeof record['access_token'] === 'string' ? record['access_token'] : previous?.accessToken;
  if (!accessToken) {
    throw new Error('OAuth response did not include access_token');
  }
  const refreshToken =
    typeof record['refresh_token'] === 'string' ? record['refresh_token'] : previous?.refreshToken;
  const tokenType =
    typeof record['token_type'] === 'string'
      ? record['token_type']
      : (previous?.tokenType ?? DEFAULT_TOKEN_TYPE);
  const scope = typeof record['scope'] === 'string' ? record['scope'] : previous?.scope;
  const expiresInRaw = record['expires_in'];
  const expiresIn =
    typeof expiresInRaw === 'number'
      ? expiresInRaw
      : typeof expiresInRaw === 'string'
        ? Number.parseInt(expiresInRaw, 10)
        : undefined;
  const expiresAt =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn)
      ? now + expiresIn * 1000
      : previous?.expiresAt;
  return {
    accessToken,
    refreshToken,
    tokenType,
    scope,
    expiresAt,
    receivedAt: now,
  };
}
