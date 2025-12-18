import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getChatRepository } from '@stina/chat';
import {
  ChatManager,
  builtinToolCatalog,
  createProvider,
  generateNewSessionStartPrompt,
  getRunningMcpProcesses,
  refreshMCPToolCache,
  setActiveToolModules,
  startTodoReminderScheduler,
  startCalendarReminderScheduler,
  startWebSocketMcpServer,
  stopAllMcpServers,
} from '@stina/core';
import { getCalendarRepository } from '@stina/calendar';
import { getToolModulesCatalog } from '@stina/core';
import { initI18n, t } from '@stina/i18n';
import { listMCPTools, listStdioMCPTools } from '@stina/mcp';
import { getMemoryRepository } from '@stina/memories';
import type { MemoryInput, MemoryUpdate } from '@stina/memories';
import { getPeopleRepository } from '@stina/people';
import {
  MCPServer,
  buildMcpAuthHeaders,
  clearMcpOAuthTokens,
  exchangeMcpAuthorizationCode,
  getCollapsedTodoProjects,
  getCollapsedCalendarGroups,
  getLanguage,
  getTimeZone,
  getEmailRules,
  getNotificationSettings,
  getCalendarSettings,
  getTodoPanelOpen,
  getTodoPanelWidth,
  getTodoSettings,
  getCalendarPanelOpen,
  getQuickCommands,
  getToolModules,
  getWeatherSettings,
  getWindowBounds,
  readSettings,
  removeMCPServer,
  resolveMCPServerConfig,
  sanitize,
  saveWindowBounds,
  setActiveProvider,
  setCollapsedCalendarGroups,
  setCollapsedTodoProjects,
  setCalendarPanelOpen,
  setDefaultMCPServer,
  setLanguage,
  setTimeZone,
  removeEmailAccount,
  setTodoPanelOpen,
  setTodoPanelWidth,
  updateCalendarSettings,
  deleteQuickCommand,
  updateNotificationSettings,
  updateProvider,
  updateTodoSettings,
  updateToolModules,
  updateWeatherSettings,
  upsertEmailAccount,
  upsertEmailRule,
  upsertQuickCommand,
  upsertMCPServer,
  setEmailAccountEnabled,
} from '@stina/settings';
import { startImapWatcher } from '@stina/email';
import type {
  PersonalitySettings,
  ProviderConfigs,
  ProviderName,
  UserProfile,
} from '@stina/settings';
import { geocodeLocation as geocodeWeatherLocation } from '@stina/weather';
import { getTodoRepository } from '@stina/work';
import type {
  RecurringTemplate,
  RecurringTemplateStep,
  RecurringTemplateStepInput,
  Todo,
  TodoStep,
  TodoStepInput,
  TodoStepUpdate,
} from '@stina/work';
import electron, {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  type NativeImage,
  Notification,
  nativeImage,
} from 'electron';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_NAME = 'Stina';
const APP_USER_MODEL_ID = 'com.einord.stina';

// Get reference to shared running MCP processes map
const runningMcpProcesses = getRunningMcpProcesses();

const preloadPath = path.resolve(__dirname, 'preload.cjs');
console.log('[electron] __dirname:', __dirname);
console.log('[electron] preload path:', preloadPath);
console.log('[electron] preload exists:', fs.existsSync(preloadPath));
app.name = APP_NAME;
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let win: BrowserWindow | null = null;
const chat = new ChatManager({
  resolveProvider: resolveProviderFromSettings,
  generateSessionPrompt: generateNewSessionStartPrompt,
  buildPromptPrelude: buildPromptPreludeFromSettings,
  refreshToolCache: refreshMCPToolCache,
});
void readSettings()
  .then((settings) => chat.setDebugMode(settings.advanced?.debugMode ?? false))
  .catch(() => undefined);
const chatRepo = getChatRepository();
const calendarRepo = getCalendarRepository();
const todoRepo = getTodoRepository();
const memoryRepo = getMemoryRepository();
const peopleRepo = getPeopleRepository();
const ICON_FILENAME = 'stina-icon-256.png';
const DEFAULT_OAUTH_WINDOW = { width: 520, height: 720 } as const;
type PendingMcpOAuth = {
  serverName: string;
  redirectUri: string;
  verifier: string;
  state: string;
  resolve: () => void;
  reject: (err: Error) => void;
};
let pendingMcpOAuth: PendingMcpOAuth | null = null;
let stopTodoScheduler: (() => void) | null = null;
let stopCalendarScheduler: (() => void) | null = null;
let lastNotifiedAssistantId: string | null = null;
let peopleUnsubscribe: (() => void) | null = null;
let stopEmailWatchers: (() => void) | null = null;

async function applyToolModulesFromSettings() {
  try {
    const modules = await getToolModules();
    setActiveToolModules({
      todo: modules.todo !== false,
      weather: modules.weather !== false,
      memory: modules.memory !== false,
      tandoor: modules.tandoor !== false,
      people: modules.people !== false,
      calendar: modules.calendar !== false,
    });
  } catch (err) {
    console.warn('[tools] Failed to apply tool module settings', err);
    setActiveToolModules({});
  }
}

async function getNotificationSound(): Promise<string | null> {
  try {
    const settings = await getNotificationSettings();
    return settings.sound ?? 'system:default';
  } catch {
    return 'system:default';
  }
}

function toElectronSoundValue(sound?: string | null): string | undefined {
  if (!sound || sound === 'system:default') return undefined;
  if (sound.startsWith('system:')) return sound.slice('system:'.length) || undefined;
  if (sound.startsWith('file://')) {
    try {
      return new URL(sound).pathname;
    } catch {
      return sound;
    }
  }
  return sound;
}

/**
 * Resolves the absolute path to the generated PNG icon, prioritizing packaged locations first.
 */
function resolveAppIcon(): string | undefined {
  const searchRoots = new Set<string>();
  if (app.isPackaged) {
    searchRoots.add(path.join(process.resourcesPath, 'assets/icons'));
  }
  searchRoots.add(path.join(__dirname, '../assets/icons'));
  searchRoots.add(path.join(process.cwd(), 'apps/desktop/assets/icons'));
  for (const root of searchRoots) {
    const candidate = path.join(root, ICON_FILENAME);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Attempts to load the generated PNG icon as a NativeImage instance for dock/taskbar usage.
 */
function loadNativeIcon(): NativeImage | undefined {
  const iconPath = resolveAppIcon();
  if (!iconPath) return undefined;
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

/**
 * Creates the main BrowserWindow, restores saved bounds, wires IPC bridges, and attaches
 * listeners so chat/store updates reach the renderer. Call once when the app becomes ready.
 */
async function createWindow() {
  const isMac = process.platform === 'darwin';
  const savedBounds = await getWindowBounds();
  const windowOptions: BrowserWindowConstructorOptions = {
    width: savedBounds?.width ?? 800,
    height: savedBounds?.height ?? 600,
    backgroundColor: isMac ? '#f7f7f8' : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    titleBarOverlay: isMac ? { color: '#00000000', height: 40 } : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };
  const appIcon = loadNativeIcon();
  if (appIcon) {
    windowOptions.icon = appIcon;
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(appIcon);
    }
  }
  if (typeof savedBounds?.x === 'number' && typeof savedBounds?.y === 'number') {
    windowOptions.x = savedBounds.x;
    windowOptions.y = savedBounds.y;
  }

  win = new BrowserWindow(windowOptions);

  let persistBoundsTimeout: NodeJS.Timeout | undefined;
  /**
   * Debounced saver that captures the current BrowserWindow bounds and writes them to settings.
   * Trigger on every move/resize/close event to keep the next session aligned.
   */
  const scheduleBoundsPersist = () => {
    if (!win) return;
    if (persistBoundsTimeout) clearTimeout(persistBoundsTimeout);
    persistBoundsTimeout = setTimeout(() => {
      if (!win) return;
      const { x, y, width, height } = win.getBounds();
      void saveWindowBounds({ x, y, width, height }).catch((err) =>
        console.error('[electron] failed to persist window bounds', err),
      );
    }, 250);
  };

  win.on('resize', scheduleBoundsPersist);
  win.on('move', scheduleBoundsPersist);
  win.on('close', scheduleBoundsPersist);
  win.on('closed', () => {
    if (persistBoundsTimeout) clearTimeout(persistBoundsTimeout);
    win = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await win.loadURL(devUrl);
    // win.webContents.openDevTools({ mode: 'detach' }); // Only use when needed
  } else {
    await win.loadFile(path.join(__dirname, '../index.html'));
  }

  chat.onInteractions((list) => {
    win?.webContents.send('chat-changed', list);
  });
  chat.onConversationChanged((conversationId) => {
    win?.webContents.send('chat-conversation-changed', conversationId);
  });
  const emitTodos = async () => {
    const todos = await todoRepo.list();
    win?.webContents.send('todos-changed', todos);
  };
  const emitProjects = async () => {
    const projects = await todoRepo.listProjects();
    win?.webContents.send('projects-changed', projects);
  };
  const emitRecurringTemplates = async () => {
    const templates = await todoRepo.listRecurringTemplates();
    win?.webContents.send('recurring-changed', templates);
  };
  const emitMemories = async () => {
    const memories = await memoryRepo.list();
    win?.webContents.send('memories-changed', memories);
  };
  const emitPeople = async () => {
    const people = await peopleRepo.list();
    win?.webContents.send('people-changed', people);
  };
  const emitQuickCommands = async () => {
    const quickCommands = await getQuickCommands();
    win?.webContents.send('quick-commands-changed', quickCommands);
  };
  todoRepo.onChange(async () => {
    await emitTodos();
    await emitProjects();
    await emitRecurringTemplates();
  });
  memoryRepo.onChange(emitMemories);
  peopleUnsubscribe?.();
  peopleUnsubscribe = peopleRepo.onChange(emitPeople);
  void emitTodos();
  void emitProjects();
  void emitRecurringTemplates();
  void emitMemories();
  void emitPeople();
  void emitQuickCommands();
  // Conversation change events are emitted via chat change payloads; renderer can derive.
}

chat.onStream((event) => {
  win?.webContents.send('chat-stream', event);
  if (event.done) {
    void maybeNotifyAssistant(event.interactionId);
  }
});

calendarRepo.onChange(() => {
  win?.webContents.send('calendar-changed');
});

/**
 * Adds a calendar and validates it by attempting to sync the ICS feed before persisting.
 * @throws Error if the URL is unreachable or contains invalid ICS data
 */
async function addCalendarWithSync(payload: { name: string; url: string; color?: string | null; enabled?: boolean }) {
  // Validate by parsing before saving
  try {
    const parsed = await calendarRepo.parseCalendar(payload.url);
    const calendar = await calendarRepo.upsertCalendar({
      name: payload.name,
      url: payload.url,
      color: payload.color,
      enabled: payload.enabled,
    });
    if (calendar.enabled !== false) {
      await calendarRepo.persistEvents(calendar, parsed.events, parsed.hash, parsed.fetchedAt);
    }
    return calendar;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync calendar.';
    throw new Error(message);
  }
}

chat.onQueue((state) => {
  win?.webContents.send('chat-queue', state);
});

async function maybeNotifyAssistant(interactionId?: string) {
  if (!Notification.isSupported()) return;
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) return;
  const icon = loadNativeIcon();
  try {
    const messages = await chatRepo.getFlattenedHistory();
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    if (!assistantMessages.length) return;
    const last = interactionId
      ? (assistantMessages.filter((m) => m.interactionId === interactionId).pop() ??
        assistantMessages[assistantMessages.length - 1])
      : assistantMessages[assistantMessages.length - 1];
    if (!last) return;
    if (lastNotifiedAssistantId === last.id) return;
    lastNotifiedAssistantId = last.id;
    const preview =
      typeof last.content === 'string' ? last.content : JSON.stringify(last.content, null, 2);
    const body = truncateNotificationBody(sanitizeNotificationBody(preview), 160);
    const sound = toElectronSoundValue(await getNotificationSound());
    const note = new Notification({
      title: APP_NAME,
      body,
      silent: false,
      sound,
      icon: icon ?? undefined,
    });
    note.show();
  } catch (err) {
    console.warn('[notification] failed to show assistant notification', err);
  }
}

/**
 * Strips common markdown markers to produce a readable plain-text notification.
 */
function sanitizeNotificationBody(content: string): string {
  let text = content;
  // Remove code fences and inline code markers
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');
  // Strip headings
  text = text.replace(/^#{1,6}\s*/gm, '');
  // Strip blockquotes
  text = text.replace(/^>\s?/gm, '');
  // Simplify lists
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Bold/italic markers
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function truncateNotificationBody(content: string, max: number): string {
  if (content.length <= max) return content;
  return `${content.slice(0, Math.max(0, max - 1))}…`;
}
chat.onWarning((warning) => {
  win?.webContents.send('chat-warning', warning);
});

// Load debug mode from settings on startup
readSettings()
  .then((settings) => {
    const debugMode = settings.advanced?.debugMode ?? false;
    chat.setDebugMode(debugMode);
    void applyToolModulesFromSettings();
  })
  .catch((err) => {
    console.warn('[main] Failed to load debug mode setting:', err);
  });

// Initialize language from settings on startup
getLanguage()
  .then((savedLang) => {
    if (savedLang) {
      // User has a saved language preference, use it
      initI18n(savedLang);
    } else {
      // No saved preference, detect from system and save it
      initI18n(); // Will auto-detect from navigator.language or process.env.LANG
      const detectedLang = require('@stina/i18n').getLang();
      setLanguage(detectedLang).catch((err) => {
        console.warn('[main] Failed to save detected language:', err);
      });
    }
  })
  .catch((err) => {
    console.warn('[main] Failed to load language setting:', err);
    initI18n(); // Fallback to auto-detection
  });

app
  .whenReady()
  .then(async () => {
    try {
      app.setAsDefaultProtocolClient('stina');
    } catch (err) {
      console.warn('[main] Failed to register stina:// protocol handler', err);
    }
    await applyToolModulesFromSettings();
    await createWindow();
    if (!stopTodoScheduler) {
      stopTodoScheduler = startTodoReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
    if (!stopCalendarScheduler) {
      stopCalendarScheduler = startCalendarReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
    void restartEmailWatchers();
    // Load MCP tools in background so UI isn't blocked by timeouts
    console.log('[main] Loading MCP tools (background)...');
    void refreshMCPToolCache()
      .then(() => console.log('[main] MCP tools loaded'))
      .catch((err) => console.warn('[main] Failed to load MCP tools:', err));
  })
  .catch((err) => console.error('[electron] failed to create window', err));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopAllMcpServers();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  maybeHandlePendingOAuthRedirect(url);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
    if (!stopTodoScheduler) {
      stopTodoScheduler = startTodoReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
    if (!stopCalendarScheduler) {
      stopCalendarScheduler = startCalendarReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
  }
});
app.on('before-quit', () => {
  stopTodoScheduler?.();
  stopCalendarScheduler?.();
  stopEmailWatchers?.();
});

ipcMain.handle('todos:get', async () => todoRepo.list());
ipcMain.handle('todos:getComments', async (_e, todoId: string) => todoRepo.listComments(todoId));
ipcMain.handle(
  'todos:create',
  async (
    _e,
    payload: {
      title: string;
      description?: string;
      dueAt?: number | null;
      status?: Todo['status'];
      projectId?: string | null;
      isAllDay?: boolean;
      reminderMinutes?: number | null;
      steps?: TodoStepInput[];
    },
  ) =>
    todoRepo.insert({
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt,
      status: payload.status,
      projectId: payload.projectId,
      isAllDay: payload.isAllDay,
      reminderMinutes: payload.reminderMinutes,
      steps: payload.steps,
    }),
);
ipcMain.handle('todos:update', async (_e, id: string, patch: Partial<Todo>) =>
  todoRepo.update(id, {
    title: patch.title,
    description: patch.description ?? undefined,
    dueAt: patch.dueAt,
    status: patch.status,
    projectId: patch.projectId,
    isAllDay: patch.isAllDay,
    reminderMinutes: patch.reminderMinutes,
  }),
);
ipcMain.handle('todos:addSteps', async (_e, todoId: string, steps: TodoStepInput[]) => {
  const created: TodoStep[] = [];
  for (const step of steps ?? []) {
    if (!step) continue;
    const inserted = await todoRepo.insertStep(todoId, {
      title: typeof step.title === 'string' ? step.title : '',
      isDone: step.isDone,
      orderIndex: step.orderIndex,
    });
    created.push(inserted);
  }
  return created;
});
ipcMain.handle('todos:updateStep', async (_e, stepId: string, patch: TodoStepUpdate) =>
  todoRepo.updateStep(stepId, {
    title: patch?.title,
    isDone: patch?.isDone,
    orderIndex: patch?.orderIndex,
  }),
);
ipcMain.handle('todos:deleteStep', async (_e, stepId: string) => todoRepo.deleteStep(stepId));
ipcMain.handle('todos:reorderSteps', async (_e, todoId: string, orderedIds: string[]) =>
  todoRepo.reorderSteps(todoId, orderedIds),
);
ipcMain.handle('todos:comment', async (_e, todoId: string, content: string) =>
  todoRepo.insertComment(todoId, content),
);
ipcMain.handle('todos:deleteComment', async (_e, commentId: string) =>
  todoRepo.deleteComment(commentId),
);
ipcMain.handle('projects:get', async () => todoRepo.listProjects());
ipcMain.handle('projects:create', async (_e, payload: { name: string; description?: string }) =>
  todoRepo.insertProject(payload),
);
ipcMain.handle(
  'projects:update',
  async (_e, id: string, patch: { name?: string; description?: string | null }) =>
    todoRepo.updateProject(id, patch),
);
ipcMain.handle('projects:delete', async (_e, id: string) => todoRepo.deleteProject(id));
ipcMain.handle('recurring:get', async () => todoRepo.listRecurringTemplates());
ipcMain.handle(
  'recurring:create',
  async (
    _e,
    payload: Partial<RecurringTemplate> & {
      title: string;
      frequency: RecurringTemplate['frequency'];
    },
  ) => todoRepo.insertRecurringTemplate(payload),
);
ipcMain.handle('recurring:update', async (_e, id: string, patch: Partial<RecurringTemplate>) =>
  todoRepo.updateRecurringTemplate(id, patch),
);
ipcMain.handle('recurring:delete', async (_e, id: string) => todoRepo.deleteRecurringTemplate(id));
ipcMain.handle(
  'recurring:addSteps',
  async (_e, templateId: string, steps: RecurringTemplateStepInput[]) => {
    const created: RecurringTemplateStep[] = [];
    for (const step of steps ?? []) {
      if (!step) continue;
      const inserted = await todoRepo.insertRecurringTemplateStep(templateId, {
        title: typeof step.title === 'string' ? step.title : '',
        orderIndex: step.orderIndex,
      });
      created.push(inserted);
    }
    return created;
  },
);
ipcMain.handle(
  'recurring:updateStep',
  async (_e, stepId: string, patch: Partial<RecurringTemplateStep>) =>
    todoRepo.updateRecurringTemplateStep(stepId, {
      title: patch.title,
      orderIndex: patch.orderIndex,
    }),
);
ipcMain.handle('recurring:deleteStep', async (_e, stepId: string) =>
  todoRepo.deleteRecurringTemplateStep(stepId),
);
ipcMain.handle('recurring:reorderSteps', async (_e, templateId: string, orderedIds: string[]) =>
  todoRepo.reorderRecurringTemplateSteps(templateId, orderedIds),
);
ipcMain.handle('memories:get', async () => memoryRepo.list());
ipcMain.handle('memories:delete', async (_e, id: string) => memoryRepo.delete(id));
ipcMain.handle('memories:create', async (_e, payload: MemoryInput) => memoryRepo.insert(payload));
ipcMain.handle('memories:update', async (_e, id: string, patch: MemoryUpdate) =>
  memoryRepo.update(id, patch),
);
ipcMain.handle('people:get', async () => peopleRepo.list());
ipcMain.handle(
  'people:upsert',
  async (_e, payload: { name: string; description?: string | null }) =>
    peopleRepo.upsert({ name: payload.name, description: payload.description ?? null }),
);
ipcMain.handle(
  'people:update',
  async (_e, id: string, patch: { name?: string; description?: string | null }) =>
    peopleRepo.update(id, patch),
);
ipcMain.handle('people:delete', async (_e, id: string) => peopleRepo.delete(id));
ipcMain.handle('tools:getModulesCatalog', async () => getToolModulesCatalog());

// Calendar IPC
ipcMain.handle('calendar:get', async () => calendarRepo.listCalendars());
ipcMain.handle(
  'calendar:add',
  async (
    _e,
    payload: { id?: string | null; name: string; url: string; color?: string | null; enabled?: boolean },
  ) =>
    addCalendarWithSync(payload),
);
ipcMain.handle('calendar:remove', async (_e, id: string) => calendarRepo.removeCalendar(id));
ipcMain.handle('calendar:setEnabled', async (_e, id: string, enabled: boolean) =>
  calendarRepo.setEnabled(id, enabled),
);
ipcMain.handle(
  'calendar:getEvents',
  async (_e, payload: { start: number; end: number; calendarId?: string }) =>
    calendarRepo.listEvents(payload.calendarId, { start: payload.start, end: payload.end }),
);

// Desktop panel state
ipcMain.handle('desktop:getCalendarPanelOpen', async () => getCalendarPanelOpen());
ipcMain.handle('desktop:setCalendarPanelOpen', async (_e, isOpen: boolean) =>
  setCalendarPanelOpen(isOpen),
);

// Chat IPC
ipcMain.handle('chat:get', async () => chat.getInteractions());
ipcMain.handle('chat:getPage', async (_e, limit: number, offset: number) =>
  chat.getInteractionsPage(limit, offset),
);
ipcMain.handle('chat:getCount', async () => chat.getMessageCount());
ipcMain.handle('chat:getActiveConversationId', async () => chat.getCurrentConversationId());
ipcMain.handle('chat:newSession', async () => {
  return chat.newSession();
});
ipcMain.handle('chat:clearHistoryExceptActive', async () => {
  return chat.clearHistoryExceptActive();
});
ipcMain.handle('chat:retryLast', async () => chat.retryLastInteraction());
ipcMain.handle('chat:cancel', async (_e, id: string) => {
  return chat.cancel(id);
});

ipcMain.handle('chat:send', async (_e, text: string) => {
  return chat.sendMessage(text);
});
ipcMain.handle('chat:getWarnings', async () => chat.getWarnings());
ipcMain.handle('chat:getQueueState', async () => chat.getQueueState());
ipcMain.handle('chat:removeQueued', async (_e, id: string) => chat.removeQueued(id));

// Settings IPC
ipcMain.handle('settings:get', async () => {
  const s = await readSettings();
  return sanitize(s);
});
ipcMain.handle(
  'settings:updateProvider',
  async (_e, name: ProviderName, cfg: Partial<ProviderConfigs[ProviderName]>) => {
    const s = await updateProvider(name, cfg);
    return sanitize(s);
  },
);
ipcMain.handle('settings:setActive', async (_e, name: ProviderName | undefined) => {
  const s = await setActiveProvider(name);
  return sanitize(s);
});
ipcMain.handle('settings:update-advanced', async (_e, advanced: { debugMode?: boolean }) => {
  const { updateAdvancedSettings } = await import('@stina/settings');
  await updateAdvancedSettings(advanced);
  const s = await readSettings();
  return sanitize(s);
});
ipcMain.handle('settings:getTodoSettings', async () => getTodoSettings());
ipcMain.handle(
  'settings:updateTodoSettings',
  async (_e, updates: Partial<import('@stina/settings').TodoSettings>) =>
    updateTodoSettings(updates),
);
ipcMain.handle('settings:getToolModules', async () => getToolModules());
ipcMain.handle(
  'settings:updateToolModules',
  async (_e, updates: Partial<import('@stina/settings').ToolModulesSettings>) =>
    updateToolModules(updates).then((next) => {
      setActiveToolModules({
        todo: next.todo !== false,
        weather: next.weather !== false,
        memory: next.memory !== false,
        tandoor: next.tandoor !== false,
        people: next.people !== false,
        calendar: next.calendar !== false,
      });
      return next;
    }),
);
ipcMain.handle('settings:getNotificationSettings', async () => getNotificationSettings());
ipcMain.handle(
  'settings:updateNotificationSettings',
  async (_e, updates: Partial<import('@stina/settings').NotificationSettings>) =>
    updateNotificationSettings(updates),
);
ipcMain.handle('settings:getCalendarSettings', async () => getCalendarSettings());
ipcMain.handle(
  'settings:updateCalendarSettings',
  async (_e, updates: Partial<import('@stina/settings').CalendarSettings>) =>
    updateCalendarSettings(updates),
);
ipcMain.handle('settings:getWeatherSettings', async () => getWeatherSettings());
ipcMain.handle('settings:setWeatherLocation', async (_e, query: string) => {
  const normalized = typeof query === 'string' ? query.trim() : '';
  if (!normalized) {
    return updateWeatherSettings({ locationQuery: undefined, location: null });
  }
  const location = await geocodeWeatherLocation(normalized);
  if (!location) {
    throw new Error(`No location found for "${normalized}".`);
  }
  return updateWeatherSettings({ locationQuery: normalized, location });
});
ipcMain.handle('settings:getQuickCommands', async () => getQuickCommands());
ipcMain.handle(
  'settings:upsertQuickCommand',
  async (_e, command: Partial<import('@stina/settings').QuickCommand>) => {
    const list = await upsertQuickCommand(command);
    win?.webContents.send('quick-commands-changed', list);
    return list;
  },
);
ipcMain.handle('settings:deleteQuickCommand', async (_e, id: string) => {
  const list = await deleteQuickCommand(id);
  win?.webContents.send('quick-commands-changed', list);
  return list;
});
ipcMain.handle('notifications:test', async (_e, sound?: string | null) => {
  if (!Notification.isSupported()) return;
  try {
    const selected = sound ?? (await getNotificationSound());
    const note = new Notification({
      title: 'Stina',
      body: 'Test notification',
      silent: false,
      sound: toElectronSoundValue(selected),
    });
    note.show();
  } catch (err) {
    console.warn('[notification] failed to send test notification', err);
    // Return undefined to avoid rejecting renderer; renderer will show error message.
  }
});
ipcMain.handle(
  'settings:updatePersonality',
  async (_e, personality: Partial<PersonalitySettings>) => {
    const { updatePersonality } = await import('@stina/settings');
    const updated = await updatePersonality(personality);
    await sendPersonalityChangeNotice(updated);
    const s = await readSettings();
    return sanitize(s);
  },
);

async function resolveProviderFromSettings(): Promise<import('@stina/chat').Provider | null> {
  const settings = await readSettings();
  const active = settings.active;
  if (!active) return null;
  try {
    return createProvider(active, settings.providers);
  } catch (err) {
    console.error('[chat] failed to create provider', err);
    return null;
  }
}

/**
 * Builds a prompt prelude payload so it can be persisted before sending.
 */
async function buildPromptPreludeFromSettings(context: { conversationId: string }) {
  const settings = await readSettings();
  const { buildPromptPrelude } = await import('@stina/core');
  return buildPromptPrelude(settings, context.conversationId);
}

function resolveLocale(settings: import('@stina/settings').SettingsState | null): string {
  return settings?.localization?.language || settings?.desktop?.language || 'en-US';
}

function formatDateTime(ts: number, locale: string, timeZone?: string | null): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: timeZone ?? undefined,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return formatter.format(new Date(ts));
}

/**
 * Restarts IMAP IDLE watchers for enabled email accounts with automation rules.
 */
async function restartEmailWatchers() {
  stopEmailWatchers?.();
  stopEmailWatchers = null;

  try {
    const settings = await readSettings();
    const accounts = settings.email?.accounts ?? [];
    const rules = settings.email?.rules ?? [];
    if (!accounts.length || !rules.length) return;

    const handles: { stop: () => void }[] = [];

    for (const account of accounts) {
      if (account.enabled === false) continue;
      if (!account.imap?.host || !account.username || !account.password) continue;
      const rule = rules.find((r) => r.accountId === account.id && r.enabled !== false);
      if (!rule?.instruction?.trim()) continue;

      const handle = startImapWatcher({
        account,
        mailbox: 'INBOX',
        onNewMessage: async ({ envelope }: { envelope: import('@stina/email').EmailMessageDetails }) => {
          try {
            const latest = await readSettings();
            const activeRule = latest.email?.rules?.find(
              (r) => r.accountId === account.id && r.enabled !== false,
            );
            if (!activeRule?.instruction?.trim()) return;

            const locale = resolveLocale(latest);
            const timeZone = latest.localization?.timezone ?? null;
            const sendPolicy =
              activeRule.sendMode === 'auto_send'
                ? t('tools.modules.email.automation.send_mode.auto_send')
                : activeRule.sendMode === 'blocked'
                  ? t('tools.modules.email.automation.send_mode.blocked')
                  : t('tools.modules.email.automation.send_mode.require_approval');

            const snippetSource = envelope.text || envelope.subject || '';
            const snippet =
              snippetSource.replace(/\s+/g, ' ').trim().slice(0, 400) ||
              t('chat.email_no_snippet');

            const dateText = envelope.date
              ? formatDateTime(envelope.date, locale, timeZone)
              : t('chat.email_unknown_time');

            const content = t('chat.email_automation_prompt', {
              account: account.label || account.emailAddress || account.username || account.id,
              from: envelope.from || t('chat.email_no_sender'),
              to: envelope.to || t('chat.email_no_recipient'),
              subject: envelope.subject || t('chat.email_no_subject'),
              date: dateText,
              snippet,
              instruction: activeRule.instruction,
              sendPolicy,
            });

            await chat.sendAutomationPrompt(content, 'instructions');
          } catch (err) {
            console.warn('[email] automation handling failed', err);
          }
        },
      });

      handles.push(handle);
    }

    if (handles.length) {
      stopEmailWatchers = () => {
        handles.forEach((h) => h.stop());
      };
    }
  } catch (err) {
    console.warn('[email] failed to restart watchers', err);
  }
}

/**
 * Announces personality changes to Stina so the provider sees the updated style immediately.
 */
async function sendPersonalityChangeNotice(next: PersonalitySettings) {
  try {
    const preset = next.preset ?? 'professional';
    const label =
      preset === 'custom'
        ? next.customText?.trim() || t('settings.personality.presets.custom.label')
        : t(`settings.personality.presets.${preset}.label`);

    const presetInstruction =
      preset !== 'custom'
        ? t(`chat.personality.presets.${preset}.instruction`)
        : (next.customText?.trim() ?? '');

    const content =
      preset === 'custom' && next.customText?.trim()
        ? t('chat.personality.change_notice_custom', {
            customText: next.customText.trim(),
          })
        : t('chat.personality.change_notice_preset', {
            preset: label,
            instruction: presetInstruction,
          });

    await chat.sendMessage(content, 'instructions');
  } catch (err) {
    console.warn('[personality] failed to send change notice', err);
  }
}

// User profile IPC
ipcMain.handle('settings:getUserProfile', async () => {
  const { getUserProfile } = await import('@stina/settings');
  return getUserProfile();
});
ipcMain.handle('settings:updateUserProfile', async (_e, profile: Partial<UserProfile>) => {
  const { updateUserProfile } = await import('@stina/settings');
  return updateUserProfile(profile);
});

// Chat debug mode
ipcMain.handle('chat:set-debug-mode', async (_e, enabled: boolean) => {
  chat.setDebugMode(enabled);
  return true;
});

// MCP server management
ipcMain.handle('mcp:getServers', async () => getSanitizedMcpState());
ipcMain.handle('mcp:upsertServer', async (_e, server: MCPServer) => {
  await upsertMCPServer(server);
  return getSanitizedMcpState();
});
ipcMain.handle('mcp:removeServer', async (_e, name: string) => {
  await removeMCPServer(name);
  return getSanitizedMcpState();
});
ipcMain.handle('mcp:setDefault', async (_e, name?: string) => {
  await setDefaultMCPServer(name);
  return getSanitizedMcpState();
});
ipcMain.handle('mcp:startOAuth', async (_e, name: string) => {
  await startMcpOAuthFlow(name);
  return getSanitizedMcpState();
});
ipcMain.handle('mcp:clearOAuth', async (_e, name: string) => {
  await clearMcpOAuthTokens(name);
  return getSanitizedMcpState();
});

ipcMain.handle('mcp:listTools', async (_e, serverOrName?: string) => {
  try {
    const serverConfig = await resolveMCPServerConfig(serverOrName);

    // Handle local builtin tools
    if (serverConfig.url && serverConfig.url.startsWith('local://')) {
      return builtinToolCatalog;
    }

    // Handle stdio servers
    if (serverConfig.type === 'stdio' && serverConfig.command) {
      return await listStdioMCPTools(serverConfig.command, serverConfig.args, serverConfig.env);
    }

    // Handle HTTP/SSE servers
    if (serverConfig.type === 'sse' && serverConfig.url) {
      const headers = buildMcpAuthHeaders(serverConfig);
      return await listMCPTools(serverConfig.url, headers ? { headers } : undefined);
    }

    // Handle WebSocket servers
    if (serverConfig.type === 'websocket' && serverConfig.url) {
      // Start server if it has a command
      if (serverConfig.command) {
        await startWebSocketMcpServer(serverConfig);
      }

      const headers = buildMcpAuthHeaders(serverConfig);
      return await listMCPTools(serverConfig.url, headers ? { headers } : undefined);
    }

    throw new Error('Invalid server configuration');
  } catch (err) {
    console.error('[mcp:listTools] Error:', err);
    throw err;
  }
});

async function getSanitizedMcpState() {
  const s = await readSettings();
  const sanitized = sanitize(s);
  return sanitized.mcp ?? { servers: [], defaultServer: undefined };
}

async function startMcpOAuthFlow(serverName: string) {
  const server = await resolveMCPServerConfig(serverName);
  const oauth = server.oauth;
  if (!oauth) throw new Error(`Server ${serverName} is not configured for OAuth`);
  if (server.authMode && server.authMode !== 'oauth') {
    throw new Error(`Server ${serverName} is not configured for OAuth mode`);
  }
  if (!oauth.authorizationUrl) throw new Error(`Server ${serverName} missing authorizationUrl`);
  if (!oauth.tokenUrl) throw new Error(`Server ${serverName} missing tokenUrl`);
  if (!oauth.clientId) throw new Error(`Server ${serverName} missing clientId`);
  if (!oauth.redirectUri) throw new Error(`Server ${serverName} missing redirectUri`);

  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const state = crypto.randomUUID();
  const authUrl = buildAuthorizationUrl(oauth.authorizationUrl, {
    clientId: oauth.clientId,
    redirectUri: oauth.redirectUri,
    scope: oauth.scope,
    state,
    challenge,
  });

  await new Promise<void>((resolve, reject) => {
    pendingMcpOAuth = {
      serverName,
      redirectUri: oauth.redirectUri!,
      verifier,
      state,
      resolve,
      reject,
    };

    const authWindow = new BrowserWindow({
      width: DEFAULT_OAUTH_WINDOW.width,
      height: DEFAULT_OAUTH_WINDOW.height,
      modal: true,
      parent: win ?? undefined,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const cleanup = () => {
      if (pendingMcpOAuth && pendingMcpOAuth.serverName === serverName) {
        pendingMcpOAuth = null;
      }
      authWindow.webContents.removeListener('will-redirect', handleRedirect);
      authWindow.webContents.removeListener('will-navigate', handleRedirect);
      authWindow.removeListener('closed', handleClosed);
    };

    const handleClosed = () => {
      cleanup();
      reject(new Error('OAuth window closed'));
    };

    const handleRedirect = (_event: Electron.Event, url: string) => {
      if (!url.startsWith(oauth.redirectUri!)) return;
      _event.preventDefault();
      const handled = maybeHandlePendingOAuthRedirect(url);
      if (handled) {
        cleanup();
        authWindow.close();
      }
    };

    authWindow.webContents.on('will-redirect', handleRedirect);
    authWindow.webContents.on('will-navigate', handleRedirect);
    authWindow.on('closed', handleClosed);

    authWindow.loadURL(authUrl).catch((err) => {
      cleanup();
      authWindow.close();
      reject(err);
    });
  });
}

function createCodeVerifier(): string {
  return toBase64Url(crypto.randomBytes(32));
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return toBase64Url(hash);
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildAuthorizationUrl(
  base: string,
  options: {
    clientId: string;
    redirectUri: string;
    scope?: string;
    state: string;
    challenge: string;
  },
) {
  const url = new URL(base);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', options.state);
  if (options.scope) url.searchParams.set('scope', options.scope);
  return url.toString();
}

function maybeHandlePendingOAuthRedirect(url: string): boolean {
  if (!pendingMcpOAuth) return false;
  if (!url.startsWith(pendingMcpOAuth.redirectUri)) return false;
  const parsed = new URL(url);
  const session = pendingMcpOAuth;
  const returnedState = parsed.searchParams.get('state');
  if (returnedState && returnedState !== pendingMcpOAuth.state) {
    pendingMcpOAuth = null;
    session.reject(new Error('OAuth state mismatch'));
    return true;
  }
  const error = parsed.searchParams.get('error');
  if (error) {
    pendingMcpOAuth = null;
    session.reject(new Error(`OAuth error: ${error}`));
    return true;
  }
  const code = parsed.searchParams.get('code');
  if (!code) return false;
  const { serverName, verifier, resolve, reject } = session;
  pendingMcpOAuth = null;
  exchangeMcpAuthorizationCode(serverName, code, verifier)
    .then(() => resolve())
    .catch((err) => reject(err));
  return true;
}

// Desktop UI state
ipcMain.handle('desktop:getTodoPanelOpen', async () => getTodoPanelOpen());
ipcMain.handle('desktop:setTodoPanelOpen', async (_e, isOpen: boolean) => setTodoPanelOpen(isOpen));
ipcMain.handle('desktop:getTodoPanelWidth', async () => getTodoPanelWidth());
ipcMain.handle('desktop:setTodoPanelWidth', async (_e, width: number) => setTodoPanelWidth(width));
ipcMain.handle('desktop:getCollapsedTodoProjects', async () => getCollapsedTodoProjects());
ipcMain.handle('desktop:setCollapsedTodoProjects', async (_e, keys: string[]) =>
  setCollapsedTodoProjects(keys),
);
ipcMain.handle('desktop:getCollapsedCalendarGroups', async () => getCollapsedCalendarGroups());
ipcMain.handle('desktop:setCollapsedCalendarGroups', async (_e, keys: string[]) =>
  setCollapsedCalendarGroups(keys),
);

// Language settings
ipcMain.handle('settings:getLanguage', async () => getLanguage());
ipcMain.handle('settings:setLanguage', async (_e, language: string) => setLanguage(language));

// Localization (timezone) settings
ipcMain.handle('settings:getTimeZone', async () => getTimeZone());
ipcMain.handle('settings:setTimeZone', async (_e, timezone: string | null) => setTimeZone(timezone));

// Email settings
ipcMain.handle('email:getAccounts', async () => {
  const s = await readSettings();
  return sanitize(s).email?.accounts ?? [];
});
ipcMain.handle('email:upsertAccount', async (_e, account: unknown) => {
  const next = await upsertEmailAccount(account as any);
  const s = await readSettings();
  void restartEmailWatchers();
  return sanitize(s).email?.accounts?.find((a) => a.id === next.id) ?? next;
});
ipcMain.handle('email:setAccountEnabled', async (_e, id: string, enabled: boolean) => {
  const next = await setEmailAccountEnabled(id, enabled);
  void restartEmailWatchers();
  const s = await readSettings();
  return sanitize(s).email?.accounts?.find((a) => a.id === next.id) ?? next;
});
ipcMain.handle('email:removeAccount', async (_e, id: string) => {
  const removed = await removeEmailAccount(id);
  void restartEmailWatchers();
  return removed;
});
ipcMain.handle('email:getRules', async () => {
  return await getEmailRules();
});
ipcMain.handle('email:upsertRule', async (_e, rule: unknown) => {
  const next = await upsertEmailRule(rule as any);
  void restartEmailWatchers();
  return next;
});
