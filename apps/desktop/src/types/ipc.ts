import type { StreamEvent, WarningEvent } from '@stina/core';
import type {
  MCPServer,
  PersonalitySettings,
  ProviderConfigs,
  ProviderName,
  SettingsState,
  UserProfile,
  NotificationSettings,
  WeatherSettings,
  QuickCommand,
} from '@stina/settings';
import type { Interaction, InteractionMessage } from '@stina/chat/types';
import type { Memory, MemoryInput, MemoryUpdate } from '@stina/memories';
import type { Person } from '@stina/people';
import type {
  Project,
  RecurringTemplate,
  RecurringTemplateStep,
  RecurringTemplateStepInput,
  Todo,
  TodoComment,
  TodoStatus,
  TodoStep,
  TodoStepInput,
  TodoStepUpdate,
} from '@stina/work';

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
  updatePersonality: (personality: Partial<PersonalitySettings>) => Promise<SettingsSnapshot>;
  getUserProfile: () => Promise<UserProfile>;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<UserProfile>;
  getLanguage: () => Promise<string | undefined>;
  setLanguage: (language: string) => Promise<string>;
  getTimeZone: () => Promise<string | null>;
  setTimeZone: (timezone: string | null) => Promise<string | null>;
  getEmailAccounts: () => Promise<import('@stina/settings').EmailAccount[]>;
  upsertEmailAccount: (
    account: Partial<import('@stina/settings').EmailAccount>,
  ) => Promise<import('@stina/settings').EmailAccount>;
  setEmailAccountEnabled: (id: string, enabled: boolean) => Promise<import('@stina/settings').EmailAccount>;
  removeEmailAccount: (id: string) => Promise<boolean>;
  getEmailRules: () => Promise<import('@stina/settings').EmailAutomationRule[]>;
  upsertEmailRule: (
    rule: Partial<import('@stina/settings').EmailAutomationRule> & { accountId: string },
  ) => Promise<import('@stina/settings').EmailAutomationRule>;
  getTodoSettings: () => Promise<SettingsSnapshot['todos']>;
  updateTodoSettings: (
    updates: Partial<SettingsSnapshot['todos']>,
  ) => Promise<SettingsSnapshot['todos']>;
  getToolModules: () => Promise<SettingsSnapshot['tools']>;
  updateToolModules: (updates: Partial<SettingsSnapshot['tools']>) => Promise<SettingsSnapshot['tools']>;
  getNotificationSettings: () => Promise<NotificationSettings>;
  updateNotificationSettings: (updates: Partial<NotificationSettings>) => Promise<NotificationSettings>;
  getCalendarSettings: () => Promise<SettingsSnapshot['calendar']>;
  updateCalendarSettings: (updates: Partial<SettingsSnapshot['calendar']>) => Promise<SettingsSnapshot['calendar']>;
  testNotification: (sound?: string | null) => Promise<void>;
  getWeatherSettings: () => Promise<WeatherSettings>;
  setWeatherLocation: (query: string) => Promise<WeatherSettings>;
  getQuickCommands: () => Promise<QuickCommand[]>;
  upsertQuickCommand: (command: Partial<QuickCommand>) => Promise<QuickCommand[]>;
  deleteQuickCommand: (id: string) => Promise<QuickCommand[]>;
  onQuickCommandsChanged: (cb: (commands: QuickCommand[]) => void) => () => void;
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
  retryLast: () => Promise<InteractionMessage | null>;
  send: (text: string) => Promise<InteractionMessage>;
  cancel: (id: string) => Promise<boolean>;
  getWarnings: () => Promise<WarningEvent[]>;
  getQueueState: () => Promise<import('@stina/core').QueueState>;
  removeQueued: (id: string) => Promise<boolean>;
  setDebugMode: (enabled: boolean) => Promise<void>;
  onChanged: (cb: (interactions: Interaction[]) => void) => () => void;
  onConversationChanged: (cb: (conversationId: string) => void) => () => void;
  onStream: (cb: (chunk: StreamEvent) => void) => () => void;
  onWarning?: (cb: (warning: WarningEvent) => void) => () => void;
  onQueue?: (cb: (state: import('@stina/core').QueueState) => void) => () => void;
}

export interface TodoAPI {
  get: () => Promise<Todo[]>;
  onChanged: (cb: (todos: Todo[]) => void) => () => void;
  getComments: (todoId: string) => Promise<TodoComment[]>;
  update?: (id: string, patch: Partial<Omit<Todo, 'id'>>) => Promise<Todo | null>;
  create?: (payload: { title: string; description?: string; dueAt?: number | null; status?: TodoStatus; projectId?: string | null; isAllDay?: boolean; reminderMinutes?: number | null; steps?: TodoStepInput[] }) => Promise<Todo>;
  comment?: (todoId: string, content: string) => Promise<TodoComment>;
  deleteComment?: (commentId: string) => Promise<boolean>;
  addSteps?: (todoId: string, steps: TodoStepInput[]) => Promise<TodoStep[]>;
  updateStep?: (stepId: string, patch: TodoStepUpdate) => Promise<TodoStep | null>;
  deleteStep?: (stepId: string) => Promise<boolean>;
  reorderSteps?: (todoId: string, orderedIds: string[]) => Promise<TodoStep[]>;
}

export interface ProjectAPI {
  get: () => Promise<Project[]>;
  onChanged: (cb: (projects: Project[]) => void) => () => void;
  create: (payload: { name: string; description?: string }) => Promise<Project>;
  update: (id: string, patch: { name?: string; description?: string | null }) => Promise<Project | null>;
  delete: (id: string) => Promise<boolean>;
}

export interface CalendarAPI {
  get: () => Promise<import('@stina/calendar').Calendar[]>;
  add: (payload: { id?: string | null; name: string; url: string; color?: string | null; enabled?: boolean }) => Promise<import('@stina/calendar').Calendar>;
  remove: (id: string) => Promise<boolean>;
  setEnabled: (id: string, enabled: boolean) => Promise<import('@stina/calendar').Calendar | null>;
  getEvents: (payload: { start: number; end: number; calendarId?: string }) => Promise<import('@stina/calendar').CalendarEvent[]>;
  onChanged?: (cb: () => void) => () => void;
}

export interface RecurringAPI {
  get: () => Promise<RecurringTemplate[]>;
  onChanged: (cb: (templates: RecurringTemplate[]) => void) => () => void;
  create: (payload: Partial<RecurringTemplate> & { title: string; frequency: RecurringTemplate['frequency'] }) => Promise<RecurringTemplate>;
  update: (id: string, patch: Partial<RecurringTemplate>) => Promise<RecurringTemplate | null>;
  delete: (id: string) => Promise<boolean>;
  addSteps?: (templateId: string, steps: RecurringTemplateStepInput[]) => Promise<RecurringTemplateStep[]>;
  updateStep?: (stepId: string, patch: Partial<RecurringTemplateStep>) => Promise<RecurringTemplateStep | null>;
  deleteStep?: (stepId: string) => Promise<boolean>;
  reorderSteps?: (templateId: string, orderedIds: string[]) => Promise<RecurringTemplateStep[]>;
}

export interface MemoryAPI {
  get: () => Promise<Memory[]>;
  create: (payload: MemoryInput) => Promise<Memory>;
  delete: (id: string) => Promise<boolean>;
  update: (id: string, patch: MemoryUpdate) => Promise<Memory | null>;
  onChanged: (cb: (memories: Memory[]) => void) => () => void;
}

export interface PeopleAPI {
  get: () => Promise<Person[]>;
  upsert: (payload: { name: string; description?: string | null }) => Promise<Person>;
  update: (id: string, patch: { name?: string; description?: string | null }) => Promise<Person | null>;
  delete: (id: string) => Promise<boolean>;
  onChanged: (cb: (people: Person[]) => void) => () => void;
}

export interface DesktopAPI {
  getTodoPanelOpen: () => Promise<boolean>;
  setTodoPanelOpen: (isOpen: boolean) => Promise<boolean>;
  getTodoPanelWidth: () => Promise<number>;
  setTodoPanelWidth: (width: number) => Promise<number>;
  getCollapsedTodoProjects: () => Promise<string[] | undefined>;
  setCollapsedTodoProjects: (keys: string[]) => Promise<string[]>;
  getCollapsedCalendarGroups?: () => Promise<string[] | undefined>;
  setCollapsedCalendarGroups?: (keys: string[]) => Promise<string[]>;
  getCalendarPanelOpen?: () => Promise<boolean>;
  setCalendarPanelOpen?: (isOpen: boolean) => Promise<boolean>;
}

export interface StinaAPI {
  settings: SettingsAPI;
  mcp: McpAPI;
  chat: ChatAPI;
  todos: TodoAPI;
  projects: ProjectAPI;
  recurring: RecurringAPI;
  memories: MemoryAPI;
  people: PeopleAPI;
  tools: {
    getModulesCatalog: () => Promise<Record<string, import('@stina/core').BaseToolSpec[]>>;
  };
  calendar: CalendarAPI;
  desktop: DesktopAPI;
}
