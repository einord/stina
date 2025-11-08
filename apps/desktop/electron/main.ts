import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ChatManager } from '@stina/core';
import { listMCPTools } from '@stina/mcp';
import {
  getWindowBounds,
  listMCPServers,
  readSettings,
  removeMCPServer,
  resolveMCPServer,
  saveWindowBounds,
  sanitize,
  setActiveProvider,
  setDefaultMCPServer,
  updateProvider,
  upsertMCPServer,
} from '@stina/settings';
import type { MCPServer, ProviderConfigs, ProviderName } from '@stina/settings';
import store from '@stina/store';
import electron, { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;
const chat = new ChatManager();

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
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  };
  if (typeof savedBounds?.x === 'number' && typeof savedBounds?.y === 'number') {
    windowOptions.x = savedBounds.x;
    windowOptions.y = savedBounds.y;
  }

  win = new BrowserWindow(windowOptions);

  let persistBoundsTimeout: NodeJS.Timeout | undefined;
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
}

chat.onStream((event) => {
  win?.webContents.send('chat-stream', event);
});
chat.onWarning((warning) => {
  win?.webContents.send('chat-warning', warning);
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

// MCP server management
ipcMain.handle('mcp:getServers', async () => listMCPServers());
ipcMain.handle('mcp:upsertServer', async (_e, server: MCPServer) => upsertMCPServer(server));
ipcMain.handle('mcp:removeServer', async (_e, name: string) => removeMCPServer(name));
ipcMain.handle('mcp:setDefault', async (_e, name?: string) => setDefaultMCPServer(name));
ipcMain.handle('mcp:listTools', async (_e, serverOrName?: string) =>
  listMCPTools(await resolveMCPServer(serverOrName)),
);
