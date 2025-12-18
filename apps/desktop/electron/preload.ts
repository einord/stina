import type { StreamEvent, WarningEvent } from '@stina/core';
import type { Interaction, InteractionMessage } from '@stina/chat';
import type { Memory, MemoryInput, MemoryUpdate } from '@stina/memories';
import type { Person } from '@stina/people';
import type {
  Project,
  RecurringTemplate,
  RecurringTemplateStep,
  RecurringTemplateStepInput,
  TodoComment,
  Todo,
  TodoStatus,
  TodoStep,
  TodoStepInput,
  TodoStepUpdate,
} from '@stina/work';

import type { McpConfig, SettingsSnapshot, StinaAPI } from '../src/types/ipc.js';

console.log('[preload] Script started');

// Use require for electron in preload context
const electron = require('electron');
console.log('[preload] Electron loaded:', !!electron);
const { contextBridge, ipcRenderer } = electron;
console.log('[preload] contextBridge:', !!contextBridge, 'ipcRenderer:', !!ipcRenderer);

/**
 * Helper that forwards IPC invocations to the main process with typed promises.
 */
const invoke = <T>(channel: string, ...args: unknown[]) =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

/**
 * Registers a renderer listener for push events from the main process.
 */
const on = <T>(channel: string, cb: (value: T) => void) => {
  const listener = (_: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

/**
 * Public API surface exposed to the renderer via contextBridge.
 */
const stinaApi: StinaAPI = {
  settings: {
    get: () => invoke<SettingsSnapshot>('settings:get'),
    updateProvider: (name, cfg) => invoke<SettingsSnapshot>('settings:updateProvider', name, cfg),
    setActive: (name) => invoke<SettingsSnapshot>('settings:setActive', name),
    updateAdvanced: (advanced: { debugMode?: boolean }) =>
      invoke<SettingsSnapshot>('settings:update-advanced', advanced),
    updatePersonality: (personality) =>
      invoke<SettingsSnapshot>('settings:updatePersonality', personality),
    getUserProfile: () => invoke('settings:getUserProfile'),
    updateUserProfile: (profile) => invoke('settings:updateUserProfile', profile),
    getLanguage: () => invoke<string | undefined>('settings:getLanguage'),
    setLanguage: (language: string) => invoke<string>('settings:setLanguage', language),
    getTimeZone: () => invoke<string | null>('settings:getTimeZone'),
    setTimeZone: (timezone: string | null) => invoke<string | null>('settings:setTimeZone', timezone),
    getEmailAccounts: () => invoke('email:getAccounts'),
    upsertEmailAccount: (account) => invoke('email:upsertAccount', account),
    setEmailAccountEnabled: (id: string, enabled: boolean) =>
      invoke('email:setAccountEnabled', id, enabled),
    removeEmailAccount: (id: string) => invoke('email:removeAccount', id),
    getEmailRules: () => invoke('email:getRules'),
    upsertEmailRule: (rule) => invoke('email:upsertRule', rule),
    getTodoSettings: () => invoke('settings:getTodoSettings'),
    updateTodoSettings: (updates) => invoke('settings:updateTodoSettings', updates),
    getToolModules: () => invoke('settings:getToolModules'),
    updateToolModules: (updates) => invoke('settings:updateToolModules', updates),
    getNotificationSettings: () => invoke('settings:getNotificationSettings'),
    updateNotificationSettings: (updates) => invoke('settings:updateNotificationSettings', updates),
    getCalendarSettings: () => invoke('settings:getCalendarSettings'),
    updateCalendarSettings: (updates) => invoke('settings:updateCalendarSettings', updates),
    testNotification: (sound?: string | null) => invoke('notifications:test', sound),
    getWeatherSettings: () => invoke('settings:getWeatherSettings'),
    setWeatherLocation: (query: string) => invoke('settings:setWeatherLocation', query),
    getQuickCommands: () => invoke('settings:getQuickCommands'),
    upsertQuickCommand: (command) => invoke('settings:upsertQuickCommand', command),
    deleteQuickCommand: (id: string) => invoke('settings:deleteQuickCommand', id),
    onQuickCommandsChanged: (cb) => on('quick-commands-changed', cb),
  },
  mcp: {
    getServers: () => invoke<McpConfig>('mcp:getServers'),
    upsertServer: (server) => invoke<McpConfig>('mcp:upsertServer', server),
    removeServer: (name) => invoke<McpConfig>('mcp:removeServer', name),
    setDefault: (name) => invoke<McpConfig>('mcp:setDefault', name),
    listTools: (serverOrName) => invoke<unknown>('mcp:listTools', serverOrName),
    startOAuth: (name) => invoke<McpConfig>('mcp:startOAuth', name),
    clearOAuth: (name) => invoke<McpConfig>('mcp:clearOAuth', name),
  },
  chat: {
    get: () => invoke<Interaction[]>('chat:get'),
    getPage: (limit: number, offset: number) =>
      invoke<Interaction[]>('chat:getPage', limit, offset),
    getCount: () => invoke<number>('chat:getCount'),
    getActiveConversationId: () => invoke<string>('chat:getActiveConversationId'),
    newSession: (label?: string) => invoke<Interaction[]>('chat:newSession', label),
    clearHistoryExceptActive: () => invoke<void>('chat:clearHistoryExceptActive'),
    retryLast: () => invoke<InteractionMessage | null>('chat:retryLast'),
    send: (text: string) => invoke<InteractionMessage>('chat:send', text),
    cancel: (id: string) => invoke<boolean>('chat:cancel', id),
    getWarnings: () => invoke<WarningEvent[]>('chat:getWarnings'),
    getQueueState: () => invoke<import('@stina/core').QueueState>('chat:getQueueState'),
    removeQueued: (id: string) => invoke<boolean>('chat:removeQueued', id),
    setDebugMode: (enabled: boolean) => invoke<void>('chat:set-debug-mode', enabled),
    onChanged: (cb) => on<Interaction[]>('chat-changed', cb),
    onConversationChanged: (cb) => on<string>('chat-conversation-changed', cb),
    onStream: (cb) => on<StreamEvent>('chat-stream', cb),
    onWarning: (cb) => on<WarningEvent>('chat-warning', cb),
    onQueue: (cb) => on<import('@stina/core').QueueState>('chat-queue', cb),
  },
  todos: {
    get: () => invoke<Todo[]>('todos:get'),
    onChanged: (cb) => on<Todo[]>('todos-changed', cb),
    getComments: (todoId: string) => invoke<TodoComment[]>('todos:getComments', todoId),
    update: (id: string, patch: Partial<Todo>) => invoke<Todo | null>('todos:update', id, patch),
    create: (payload: { title: string; description?: string; dueAt?: number | null; status?: TodoStatus; projectId?: string | null; isAllDay?: boolean; reminderMinutes?: number | null; steps?: TodoStepInput[] }) =>
      invoke<Todo>('todos:create', payload),
    comment: (todoId: string, content: string) => invoke<TodoComment>('todos:comment', todoId, content),
    deleteComment: (commentId: string) => invoke<boolean>('todos:deleteComment', commentId),
    addSteps: (todoId: string, steps: TodoStepInput[]) => invoke<TodoStep[]>('todos:addSteps', todoId, steps),
    updateStep: (stepId: string, patch: TodoStepUpdate) => invoke<TodoStep | null>('todos:updateStep', stepId, patch),
    deleteStep: (stepId: string) => invoke<boolean>('todos:deleteStep', stepId),
    reorderSteps: (todoId: string, orderedIds: string[]) =>
      invoke<TodoStep[]>('todos:reorderSteps', todoId, orderedIds),
  },
  projects: {
    get: () => invoke<Project[]>('projects:get'),
    onChanged: (cb) => on<Project[]>('projects-changed', cb),
    create: (payload: { name: string; description?: string }) => invoke<Project>('projects:create', payload),
    update: (id: string, patch: { name?: string; description?: string | null }) =>
      invoke<Project | null>('projects:update', id, patch),
    delete: (id: string) => invoke<boolean>('projects:delete', id),
  },
  recurring: {
    get: () => invoke<RecurringTemplate[]>('recurring:get'),
    onChanged: (cb) => on<RecurringTemplate[]>('recurring-changed', cb),
    create: (payload: Partial<RecurringTemplate> & { title: string; frequency: RecurringTemplate['frequency'] }) =>
      invoke<RecurringTemplate>('recurring:create', payload),
    update: (id: string, patch: Partial<RecurringTemplate>) =>
      invoke<RecurringTemplate | null>('recurring:update', id, patch),
    delete: (id: string) => invoke<boolean>('recurring:delete', id),
    addSteps: (templateId: string, steps: RecurringTemplateStepInput[]) =>
      invoke<RecurringTemplateStep[]>('recurring:addSteps', templateId, steps),
    updateStep: (stepId: string, patch: Partial<RecurringTemplateStep>) =>
      invoke<RecurringTemplateStep | null>('recurring:updateStep', stepId, patch),
    deleteStep: (stepId: string) => invoke<boolean>('recurring:deleteStep', stepId),
    reorderSteps: (templateId: string, orderedIds: string[]) =>
      invoke<RecurringTemplateStep[]>('recurring:reorderSteps', templateId, orderedIds),
  },
  memories: {
    get: () => invoke<Memory[]>('memories:get'),
    create: (payload: MemoryInput) => invoke<Memory>('memories:create', payload),
    delete: (id: string) => invoke<boolean>('memories:delete', id),
    update: (id: string, patch: MemoryUpdate) => invoke<Memory | null>('memories:update', id, patch),
    onChanged: (cb) => on<Memory[]>('memories-changed', cb),
  },
  people: {
    get: () => invoke<Person[]>('people:get'),
    upsert: (payload: { name: string; description?: string | null }) =>
      invoke<Person>('people:upsert', payload),
    update: (id: string, patch: { name?: string; description?: string | null }) =>
      invoke<Person | null>('people:update', id, patch),
    delete: (id: string) => invoke<boolean>('people:delete', id),
    onChanged: (cb) => on<Person[]>('people-changed', cb),
  },
  tools: {
    getModulesCatalog: () =>
      invoke<Record<string, import('@stina/core').BaseToolSpec[]>>('tools:getModulesCatalog'),
  },
  calendar: {
    get: () => invoke<import('@stina/calendar').Calendar[]>('calendar:get'),
    add: (payload: { id?: string | null; name: string; url: string; color?: string | null; enabled?: boolean }) =>
      invoke<import('@stina/calendar').Calendar>('calendar:add', payload),
    remove: (id: string) => invoke<boolean>('calendar:remove', id),
    setEnabled: (id: string, enabled: boolean) => invoke<import('@stina/calendar').Calendar | null>('calendar:setEnabled', id, enabled),
    getEvents: (payload: { start: number; end: number; calendarId?: string }) =>
      invoke<import('@stina/calendar').CalendarEvent[]>('calendar:getEvents', payload),
    onChanged: (cb) => on<void>('calendar-changed', cb),
  },
  desktop: {
    getTodoPanelOpen: () => invoke<boolean>('desktop:getTodoPanelOpen'),
    setTodoPanelOpen: (isOpen: boolean) => invoke<boolean>('desktop:setTodoPanelOpen', isOpen),
    getTodoPanelWidth: () => invoke<number>('desktop:getTodoPanelWidth'),
    setTodoPanelWidth: (width: number) => invoke<number>('desktop:setTodoPanelWidth', width),
    getCalendarPanelOpen: () => invoke<boolean>('desktop:getCalendarPanelOpen'),
    setCalendarPanelOpen: (isOpen: boolean) => invoke<boolean>('desktop:setCalendarPanelOpen', isOpen),
    getCollapsedTodoProjects: () => invoke<string[] | undefined>('desktop:getCollapsedTodoProjects'),
    setCollapsedTodoProjects: (keys: string[]) =>
      invoke<string[]>('desktop:setCollapsedTodoProjects', keys),
    getCollapsedCalendarGroups: () =>
      invoke<string[] | undefined>('desktop:getCollapsedCalendarGroups'),
    setCollapsedCalendarGroups: (keys: string[]) =>
      invoke<string[]>('desktop:setCollapsedCalendarGroups', keys),
  },
};

console.log('[preload] Exposing stina API to main world');
contextBridge.exposeInMainWorld('stina', stinaApi);
console.log('[preload] stina API exposed successfully');

export type PreloadAPI = typeof window & {
  stina: StinaAPI;
};
