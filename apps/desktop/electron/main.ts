import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ChatManager, builtinToolCatalog } from '@stina/core';
import { listMCPTools, listStdioMCPTools } from '@stina/mcp';
import {
  getTodoPanelOpen,
  getTodoPanelWidth,
  getWindowBounds,
  listMCPServers,
  readSettings,
  removeMCPServer,
  resolveMCPServerConfig,
  sanitize,
  saveWindowBounds,
  setActiveProvider,
  setDefaultMCPServer,
  setTodoPanelOpen,
  setTodoPanelWidth,
  updateProvider,
  upsertMCPServer,
} from '@stina/settings';
import type { MCPServer, ProviderConfigs, ProviderName, UserProfile } from '@stina/settings';
import store from '@stina/store';
import electron, {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  type NativeImage,
  nativeImage,
} from 'electron';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;
const chat = new ChatManager();
const ICON_FILENAME = 'stina-icon-256.png';

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
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
  store.onMessages((msgs) => {
    win?.webContents.send('chat-changed', msgs);
  });
  store.onTodos((todos) => {
    win?.webContents.send('todos-changed', todos);
  });
}

chat.onStream((event) => {
  win?.webContents.send('chat-stream', event);
});
chat.onWarning((warning) => {
  win?.webContents.send('chat-warning', warning);
});

// Initialize debug mode from settings
readSettings()
  .then((settings) => {
    const debugMode = settings.advanced?.debugMode ?? false;
    chat.setDebugMode(debugMode);
  })
  .catch((err) => {
    console.warn('[main] Failed to load debug mode setting:', err);
  });

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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

// Chat IPC
ipcMain.handle('chat:get', async () => chat.getMessages());
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
ipcMain.handle('mcp:getServers', async () => listMCPServers());
ipcMain.handle('mcp:upsertServer', async (_e, server: MCPServer) => upsertMCPServer(server));
ipcMain.handle('mcp:removeServer', async (_e, name: string) => removeMCPServer(name));
ipcMain.handle('mcp:setDefault', async (_e, name?: string) => setDefaultMCPServer(name));
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
      return await listMCPTools(serverConfig.url);
    }

    throw new Error('Invalid server configuration');
  } catch (err) {
    console.error('[mcp:listTools] Error:', err);
    throw err;
  }
});

// Desktop UI state
ipcMain.handle('desktop:getTodoPanelOpen', async () => getTodoPanelOpen());
ipcMain.handle('desktop:setTodoPanelOpen', async (_e, isOpen: boolean) => setTodoPanelOpen(isOpen));
ipcMain.handle('desktop:getTodoPanelWidth', async () => getTodoPanelWidth());
ipcMain.handle('desktop:setTodoPanelWidth', async (_e, width: number) => setTodoPanelWidth(width));
