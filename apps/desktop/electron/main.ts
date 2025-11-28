import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ChatManager,
  builtinToolCatalog,
  createProvider,
  generateNewSessionStartPrompt,
  startTodoReminderScheduler,
} from '@stina/core';
import { getChatRepository } from '@stina/chat';
import { initI18n } from '@stina/i18n';
import { listMCPTools, listStdioMCPTools } from '@stina/mcp';
import {
  buildMcpAuthHeaders,
  clearMcpOAuthTokens,
  exchangeMcpAuthorizationCode,
  getLanguage,
  getTodoPanelOpen,
  getTodoPanelWidth,
  getTodoSettings,
  getWindowBounds,
  readSettings,
  removeMCPServer,
  resolveMCPServerConfig,
  sanitize,
  saveWindowBounds,
  setActiveProvider,
  setDefaultMCPServer,
  setLanguage,
  setTodoPanelOpen,
  setTodoPanelWidth,
  updateProvider,
  updateTodoSettings,
  upsertMCPServer,
} from '@stina/settings';
import type {
  MCPServer,
  PersonalitySettings,
  ProviderConfigs,
  ProviderName,
  UserProfile,
} from '@stina/settings';
import type { InteractionMessage } from '@stina/chat/types';
import { getMemoryRepository } from '@stina/memories';
import type { MemoryUpdate } from '@stina/memories';
import { getTodoRepository } from '@stina/todos';
import type { Todo } from '@stina/todos';
import electron, {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  type NativeImage,
  nativeImage,
  Notification,
} from 'electron';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const preloadPath = path.resolve(__dirname, 'preload.cjs');
console.log('[electron] __dirname:', __dirname);
console.log('[electron] preload path:', preloadPath);
console.log('[electron] preload exists:', fs.existsSync(preloadPath));

let win: BrowserWindow | null = null;
const chat = new ChatManager({
  resolveProvider: resolveProviderFromSettings,
  generateSessionPrompt: generateNewSessionStartPrompt,
  prepareHistory: preparePromptHistory,
});
const chatRepo = getChatRepository();
const todoRepo = getTodoRepository();
const memoryRepo = getMemoryRepository();
const ICON_FILENAME = 'stina-icon-256.png';
const DEFAULT_OAUTH_WINDOW = { width: 520, height: 720 } as const;
let stopTodoScheduler: (() => void) | null = null;

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
    win.webContents.openDevTools({ mode: 'detach' });
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
  const emitMemories = async () => {
    const memories = await memoryRepo.list();
    win?.webContents.send('memories-changed', memories);
  };
  todoRepo.onChange(async () => {
    await emitTodos();
    await emitProjects();
  });
  memoryRepo.onChange(emitMemories);
  void emitTodos();
  void emitProjects();
  void emitMemories();
  // Conversation change events are emitted via chat change payloads; renderer can derive.
}

chat.onStream((event) => {
  win?.webContents.send('chat-stream', event);
});

chatRepo.onChange(async (payload) => {
  if (payload.kind !== 'message') return;
  if (!win || win.isFocused()) return;
  if (!Notification.isSupported()) return;
  try {
    const messages = await chatRepo.getFlattenedHistory(payload.conversationId);
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    const preview = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
    const body = preview.length > 160 ? `${preview.slice(0, 157)}…` : preview;
    const note = new Notification({
      title: 'Stina',
      body,
    });
    note.show();
  } catch (err) {
    console.warn('[notification] failed to show assistant notification', err);
  }
});
chat.onWarning((warning) => {
  win?.webContents.send('chat-warning', warning);
});

// Load debug mode from settings on startup
readSettings()
  .then((settings) => {
    const debugMode = settings.advanced?.debugMode ?? false;
    chat.setDebugMode(debugMode);
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
    await createWindow();
    if (!stopTodoScheduler) {
      stopTodoScheduler = startTodoReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
  })
  .catch((err) => console.error('[electron] failed to create window', err));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
    if (!stopTodoScheduler) {
      stopTodoScheduler = startTodoReminderScheduler({
        notify: (content) => chat.sendMessage(content, 'instructions'),
      });
    }
  }
});
app.on('before-quit', () => {
  stopTodoScheduler?.();
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
ipcMain.handle('todos:comment', async (_e, todoId: string, content: string) =>
  todoRepo.insertComment(todoId, content),
);
ipcMain.handle('projects:get', async () => todoRepo.listProjects());
ipcMain.handle('projects:create', async (_e, payload: { name: string; description?: string }) =>
  todoRepo.insertProject(payload),
);
ipcMain.handle('projects:update', async (_e, id: string, patch: { name?: string; description?: string | null }) =>
  todoRepo.updateProject(id, patch),
);
ipcMain.handle('projects:delete', async (_e, id: string) => todoRepo.deleteProject(id));
ipcMain.handle('memories:get', async () => memoryRepo.list());
ipcMain.handle('memories:delete', async (_e, id: string) => memoryRepo.delete(id));
ipcMain.handle('memories:update', async (_e, id: string, patch: MemoryUpdate) => memoryRepo.update(id, patch));

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
ipcMain.handle('chat:cancel', async (_e, id: string) => {
  return chat.cancel(id);
});

ipcMain.handle('chat:send', async (_e, text: string) => {
  return chat.sendMessage(text);
});
ipcMain.handle('chat:getWarnings', async () => chat.getWarnings());

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
  async (_e, updates: Partial<import('@stina/settings').TodoSettings>) => updateTodoSettings(updates),
);
ipcMain.handle('settings:updatePersonality', async (_e, personality: Partial<PersonalitySettings>) => {
  const { updatePersonality } = await import('@stina/settings');
  await updatePersonality(personality);
  const s = await readSettings();
  return sanitize(s);
});

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

async function preparePromptHistory(history: InteractionMessage[], context: { conversationId: string }) {
  const settings = await readSettings();
  const { buildPromptPrelude } = await import('@stina/core');
  const prelude = buildPromptPrelude(settings, context.conversationId);
  return { history: [...prelude.messages, ...history], debugContent: prelude.debugText };
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
      return await listStdioMCPTools(serverConfig.command);
    }

    // Handle WebSocket servers
    if (serverConfig.type === 'websocket' && serverConfig.url) {
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
      const parsed = new URL(url);
      const returnedState = parsed.searchParams.get('state');
      if (returnedState && returnedState !== state) {
        cleanup();
        authWindow.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }
      const error = parsed.searchParams.get('error');
      if (error) {
        cleanup();
        authWindow.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      const code = parsed.searchParams.get('code');
      if (!code) return;
      cleanup();
      authWindow.close();
      exchangeMcpAuthorizationCode(serverName, code, verifier)
        .then(() => resolve())
        .catch((err) => reject(err));
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

// Desktop UI state
ipcMain.handle('desktop:getTodoPanelOpen', async () => getTodoPanelOpen());
ipcMain.handle('desktop:setTodoPanelOpen', async (_e, isOpen: boolean) => setTodoPanelOpen(isOpen));
ipcMain.handle('desktop:getTodoPanelWidth', async () => getTodoPanelWidth());
ipcMain.handle('desktop:setTodoPanelWidth', async (_e, width: number) => setTodoPanelWidth(width));

// Language settings
ipcMain.handle('settings:getLanguage', async () => getLanguage());
ipcMain.handle('settings:setLanguage', async (_e, language: string) => setLanguage(language));
