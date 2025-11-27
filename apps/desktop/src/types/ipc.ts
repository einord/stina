import type { StreamEvent, WarningEvent } from '@stina/core';
import type {
  MCPServer,
  ProviderConfigs,
  ProviderName,
  SettingsState,
  UserProfile,
} from '@stina/settings';
import type { Interaction, InteractionMessage } from '@stina/chat/types';
import type { Memory, MemoryUpdate } from '@stina/memories';
import type { Todo, TodoComment, TodoStatus } from '@stina/todos';

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
  startOAuth: (name: string) => Promise<McpConfig>;
  clearOAuth: (name: string) => Promise<McpConfig>;
}

export interface ChatAPI {
  get: () => Promise<Interaction[]>;
  getPage: (limit: number, offset: number) => Promise<Interaction[]>;
  getCount: () => Promise<number>;
  getActiveConversationId: () => Promise<string>;
  newSession: (label?: string) => Promise<Interaction[]>;
  clearHistoryExceptActive: () => Promise<void>;
  send: (text: string) => Promise<InteractionMessage>;
  cancel: (id: string) => Promise<boolean>;
  getWarnings: () => Promise<WarningEvent[]>;
  setDebugMode: (enabled: boolean) => Promise<void>;
  onChanged: (cb: (interactions: Interaction[]) => void) => () => void;
  onConversationChanged: (cb: (conversationId: string) => void) => () => void;
  onStream: (cb: (chunk: StreamEvent) => void) => () => void;
  onWarning?: (cb: (warning: WarningEvent) => void) => () => void;
}

export interface TodoAPI {
  get: () => Promise<Todo[]>;
  onChanged: (cb: (todos: Todo[]) => void) => () => void;
  getComments: (todoId: string) => Promise<TodoComment[]>;
  update?: (id: string, patch: Partial<Omit<Todo, 'id'>>) => Promise<Todo | null>;
  create?: (payload: { title: string; description?: string; dueAt?: number | null; status?: TodoStatus }) => Promise<Todo>;
  comment?: (todoId: string, content: string) => Promise<TodoComment>;
}

export interface MemoryAPI {
  get: () => Promise<Memory[]>;
  delete: (id: string) => Promise<boolean>;
  update: (id: string, patch: MemoryUpdate) => Promise<Memory | null>;
  onChanged: (cb: (memories: Memory[]) => void) => () => void;
}

export interface DesktopAPI {
  getTodoPanelOpen: () => Promise<boolean>;
  setTodoPanelOpen: (isOpen: boolean) => Promise<boolean>;
  getTodoPanelWidth: () => Promise<number>;
  setTodoPanelWidth: (width: number) => Promise<number>;
}

export interface StinaAPI {
  settings: SettingsAPI;
  mcp: McpAPI;
  chat: ChatAPI;
  todos: TodoAPI;
  memories: MemoryAPI;
  desktop: DesktopAPI;
}
