import type { StreamEvent, WarningEvent } from '@stina/core';
import type {
  MCPServer,
  ProviderConfigs,
  ProviderName,
  SettingsState,
  UserProfile,
} from '@stina/settings';
import type { ChatMessage, MemoryItem, MemoryUpdate, TodoComment, TodoItem } from '@stina/store';

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
  updateAdvanced: (advanced: { debugMode?: boolean }) => Promise<SettingsSnapshot>;
  getUserProfile: () => Promise<UserProfile>;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<UserProfile>;
  getLanguage: () => Promise<string | undefined>;
  setLanguage: (language: string) => Promise<string>;
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
  getPage: (limit: number, offset: number) => Promise<ChatMessage[]>;
  getCount: () => Promise<number>;
  newSession: (label?: string) => Promise<ChatMessage[]>;
  send: (text: string) => Promise<ChatMessage>;
  cancel: (id: string) => Promise<boolean>;
  getWarnings: () => Promise<WarningEvent[]>;
  setDebugMode: (enabled: boolean) => Promise<void>;
  onChanged: (cb: (messages: ChatMessage[]) => void) => () => void;
  onStream: (cb: (chunk: StreamEvent) => void) => () => void;
  onWarning?: (cb: (warning: WarningEvent) => void) => () => void;
}

export interface TodoAPI {
  get: () => Promise<TodoItem[]>;
  onChanged: (cb: (todos: TodoItem[]) => void) => () => void;
  getComments: (todoId: string) => Promise<TodoComment[]>;
}

export interface MemoryAPI {
  get: () => Promise<MemoryItem[]>;
  delete: (id: string) => Promise<boolean>;
  update: (id: string, patch: MemoryUpdate) => Promise<MemoryItem | null>;
  onChanged: (cb: (memories: MemoryItem[]) => void) => () => void;
}

export interface DesktopAPI {
  getTodoPanelOpen: () => Promise<boolean>;
  setTodoPanelOpen: (isOpen: boolean) => Promise<boolean>;
  getTodoPanelWidth: () => Promise<number>;
  setTodoPanelWidth: (width: number) => Promise<number>;
}

export interface StinaAPI {
  getCount: () => Promise<number>;
  increment: (by?: number) => Promise<number>;
  onCountChanged: (cb: (count: number) => void) => () => void;
  settings: SettingsAPI;
  mcp: McpAPI;
  chat: ChatAPI;
  todos: TodoAPI;
  memories: MemoryAPI;
  desktop: DesktopAPI;
}
