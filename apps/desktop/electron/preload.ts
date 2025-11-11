import type { StreamEvent, WarningEvent } from '@stina/core';
import type { ChatMessage, MemoryItem, MemoryUpdate, TodoComment, TodoItem } from '@stina/store';

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
  getCount: () => invoke<number>('get-count'),
  increment: (by = 1) => invoke<number>('increment', by),
  onCountChanged: (cb) => on<number>('count-changed', cb),
  settings: {
    get: () => invoke<SettingsSnapshot>('settings:get'),
    updateProvider: (name, cfg) => invoke<SettingsSnapshot>('settings:updateProvider', name, cfg),
    setActive: (name) => invoke<SettingsSnapshot>('settings:setActive', name),
    updateAdvanced: (advanced: { debugMode?: boolean }) =>
      invoke<SettingsSnapshot>('settings:update-advanced', advanced),
    getUserProfile: () => invoke('settings:getUserProfile'),
    updateUserProfile: (profile) => invoke('settings:updateUserProfile', profile),
    getLanguage: () => invoke<string | undefined>('settings:getLanguage'),
    setLanguage: (language: string) => invoke<string>('settings:setLanguage', language),
  },
  mcp: {
    getServers: () => invoke<McpConfig>('mcp:getServers'),
    upsertServer: (server) => invoke<McpConfig>('mcp:upsertServer', server),
    removeServer: (name) => invoke<McpConfig>('mcp:removeServer', name),
    setDefault: (name) => invoke<McpConfig>('mcp:setDefault', name),
    listTools: (serverOrName) => invoke<unknown>('mcp:listTools', serverOrName),
  },
  chat: {
    get: () => invoke<ChatMessage[]>('chat:get'),
    newSession: (label?: string) => invoke<ChatMessage[]>('chat:newSession', label),
    send: (text: string) => invoke<ChatMessage>('chat:send', text),
    cancel: (id: string) => invoke<boolean>('chat:cancel', id),
    getWarnings: () => invoke<WarningEvent[]>('chat:getWarnings'),
    setDebugMode: (enabled: boolean) => invoke<void>('chat:set-debug-mode', enabled),
    onChanged: (cb) => on<ChatMessage[]>('chat-changed', cb),
    onStream: (cb) => on<StreamEvent>('chat-stream', cb),
    onWarning: (cb) => on<WarningEvent>('chat-warning', cb),
  },
  todos: {
    get: () => invoke<TodoItem[]>('todos:get'),
    onChanged: (cb) => on<TodoItem[]>('todos-changed', cb),
    getComments: (todoId: string) => invoke<TodoComment[]>('todos:getComments', todoId),
  },
  memories: {
    get: () => invoke<MemoryItem[]>('memories:get'),
    delete: (id: string) => invoke<boolean>('memories:delete', id),
    update: (id: string, patch: MemoryUpdate) =>
      invoke<MemoryItem | null>('memories:update', id, patch),
    onChanged: (cb) => on<MemoryItem[]>('memories-changed', cb),
  },
  desktop: {
    getTodoPanelOpen: () => invoke<boolean>('desktop:getTodoPanelOpen'),
    setTodoPanelOpen: (isOpen: boolean) => invoke<boolean>('desktop:setTodoPanelOpen', isOpen),
    getTodoPanelWidth: () => invoke<number>('desktop:getTodoPanelWidth'),
    setTodoPanelWidth: (width: number) => invoke<number>('desktop:setTodoPanelWidth', width),
  },
};

console.log('[preload] Exposing stina API to main world');
contextBridge.exposeInMainWorld('stina', stinaApi);
console.log('[preload] stina API exposed successfully');

export type PreloadAPI = typeof window & {
  stina: StinaAPI;
};
