import type { StreamEvent, WarningEvent } from '@stina/core';
import type { MCPServer, ProviderConfigs, ProviderName, SettingsState } from '@stina/settings';
import type { ChatMessage } from '@stina/store';

export type SettingsSnapshot = SettingsState;
export type McpConfig = {
  servers: MCPServer[];
  defaultServer?: string;
};

export interface SettingsAPI {
  get: () => Promise<SettingsSnapshot>;
  updateProvider: <T extends ProviderName>(
    name: T,
    cfg: Partial<ProviderConfigs[T]>,
  ) => Promise<SettingsSnapshot>;
  setActive: (name?: ProviderName) => Promise<SettingsSnapshot>;
}

export interface McpAPI {
  getServers: () => Promise<McpConfig>;
  upsertServer: (server: MCPServer) => Promise<McpConfig>;
  removeServer: (name: string) => Promise<McpConfig>;
  setDefault: (name?: string) => Promise<McpConfig>;
  listTools: (serverOrName?: string) => Promise<unknown>;
}

export interface ChatAPI {
  get: () => Promise<ChatMessage[]>;
  newSession: (label?: string) => Promise<ChatMessage[]>;
  send: (text: string) => Promise<ChatMessage>;
  cancel: (id: string) => Promise<boolean>;
  getWarnings: () => Promise<WarningEvent[]>;
  onChanged: (cb: (messages: ChatMessage[]) => void) => () => void;
  onStream: (cb: (chunk: StreamEvent) => void) => () => void;
  onWarning?: (cb: (warning: WarningEvent) => void) => () => void;
}

export interface StinaAPI {
  getCount: () => Promise<number>;
  increment: (by?: number) => Promise<number>;
  onCountChanged: (cb: (count: number) => void) => () => void;
  settings: SettingsAPI;
  mcp: McpAPI;
  chat: ChatAPI;
}
