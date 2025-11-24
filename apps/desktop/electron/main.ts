import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ChatManager, builtinToolCatalog } from '@stina/core';
import { initI18n } from '@stina/i18n';
import { listMCPTools, listStdioMCPTools } from '@stina/mcp';
import {
  buildMcpAuthHeaders,
  clearMcpOAuthTokens,
  exchangeMcpAuthorizationCode,
  getLanguage,
  getTodoPanelOpen,
  getTodoPanelWidth,
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
  upsertMCPServer,
} from '@stina/settings';
import type { MCPServer, ProviderConfigs, ProviderName, UserProfile } from '@stina/settings';
import store from '@stina/store';
import type { MemoryUpdate } from '@stina/store';
import electron, {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  type NativeImage,
  nativeImage,
} from 'electron';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track running WebSocket MCP server processes
const runningMcpProcesses = new Map<string, ChildProcess>();

const preloadPath = path.resolve(__dirname, 'preload.cjs');
console.log('[electron] __dirname:', __dirname);
console.log('[electron] preload path:', preloadPath);
console.log('[electron] preload exists:', fs.existsSync(preloadPath));

let win: BrowserWindow | null = null;
const chat = new ChatManager();
const ICON_FILENAME = 'stina-icon-256.png';
const DEFAULT_OAUTH_WINDOW = { width: 520, height: 720 } as const;

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

  store.subscribe((count) => {
    console.log('[electron] emit count-changed', count);
    win?.webContents.send('count-changed', count);
  });
  store.onInteractions((list) => {
    win?.webContents.send('chat-changed', list);
  });
  store.onTodos((todos) => {
    win?.webContents.send('todos-changed', todos);
  });
  store.onMemories((memories) => {
    win?.webContents.send('memories-changed', memories);
  });
  store.onConversationChange((conversationId) => {
    win?.webContents.send('chat-conversation-changed', conversationId);
  });
}

chat.onStream((event) => {
  win?.webContents.send('chat-stream', event);
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  console.log('[mcp] Shutting down MCP servers...');
  for (const [name, process] of runningMcpProcesses.entries()) {
    console.log(`[mcp] Stopping MCP server: ${name}`);
    process.kill();
  }
  runningMcpProcesses.clear();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});

ipcMain.handle('get-count', async () => {
  console.log('[electron] get-count');
  return store.getCount();
});
ipcMain.handle('increment', async (_e, by: number = 1) => store.increment(by));
ipcMain.handle('todos:get', async () => store.getTodos());
ipcMain.handle('todos:getComments', async (_e, todoId: string) => store.getTodoComments(todoId));
ipcMain.handle('memories:get', async () => store.getMemories());
ipcMain.handle('memories:delete', async (_e, id: string) => {
  const { deleteMemoryById } = await import('@stina/store/memories');
  return deleteMemoryById(id);
});
ipcMain.handle('memories:update', async (_e, id: string, patch: MemoryUpdate) => {
  const { updateMemoryById } = await import('@stina/store/memories');
  return updateMemoryById(id, patch);
});

// Chat IPC
ipcMain.handle('chat:get', async () => chat.getInteractions());
ipcMain.handle('chat:getPage', async (_e, limit: number, offset: number) =>
  store.getMessagesPage(limit, offset),
);
ipcMain.handle('chat:getCount', async () => store.getMessageCount());
ipcMain.handle('chat:getActiveConversationId', async () => store.getCurrentConversationId());
ipcMain.handle('chat:newSession', async () => {
  return chat.newSession();
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
/**
 * Starts a WebSocket MCP server process if it has a command configured.
 * Returns true if server was started or already running.
 */
async function startWebSocketMcpServer(server: MCPServer): Promise<boolean> {
  // Check if already running
  if (runningMcpProcesses.has(server.name)) {
    console.log(`[mcp] Server ${server.name} already running`);
    return true;
  }

  if (!server.command) {
    return false;
  }

  console.log(`[mcp] Starting WebSocket MCP server: ${server.name}`);

  const args = server.args ? server.args.trim().split(/\s+/) : [];
  const process = spawn(server.command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runningMcpProcesses.set(server.name, process);

  // Log output for debugging
  process.stdout?.on('data', (chunk) => {
    console.log(`[${server.name}]`, chunk.toString().trim());
  });

  process.stderr?.on('data', (chunk) => {
    console.error(`[${server.name}]`, chunk.toString().trim());
  });

  process.on('exit', (code) => {
    console.log(`[mcp] Server ${server.name} exited with code ${code}`);
    runningMcpProcesses.delete(server.name);
  });

  // Wait for server to start (give it 2 seconds)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return true;
}

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
