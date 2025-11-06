import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listMCPTools } from '@stina/mcp';
import {
  listMCPServers,
  readSettings,
  removeMCPServer,
  resolveMCPServer,
  sanitize,
  setActiveProvider,
  setDefaultMCPServer,
  updateProvider,
  upsertMCPServer,
} from '@stina/settings';
import store, { ChatMessage } from '@stina/store';
import electron, { BrowserWindow } from 'electron';

import { createProvider } from './providers/index.js';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

async function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
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

async function routeToProvider(prompt: string, history: ChatMessage[]): Promise<string> {
  const s = await readSettings();
  const active = s.active;
  if (!active) return 'No provider selected in Settings.';
  try {
    const provider = createProvider(active, s.providers);
    return await provider.send(prompt, history);
  } catch (err: any) {
    return `Error: ${err?.message ?? String(err)}`;
  }
}

// provider-specific implementations moved to ./providers

// Chat IPC
ipcMain.handle('chat:get', async () => store.getMessages());
let _lastNewSessionAt = 0;
ipcMain.handle('chat:newSession', async () => {
  // Debounce in case of accidental double-trigger from UI/dev
  const now = Date.now();
  if (now - _lastNewSessionAt < 400) {
    return store.getMessages();
  }
  _lastNewSessionAt = now;
  const msg: ChatMessage = {
    id: Math.random().toString(36).slice(2),
    role: 'info',
    content: `New session • ${new Date().toLocaleString()}`,
    ts: now,
  };
  await store.appendMessage(msg);
  return store.getMessages();
});
ipcMain.handle('chat:send', async (_e, text: string) => {
  const user: ChatMessage = {
    id: Math.random().toString(36).slice(2),
    role: 'user',
    content: text,
    ts: Date.now(),
  };
  await store.appendMessage(user);
  const replyText = await routeToProvider(text, store.getMessages());
  const assistant: ChatMessage = {
    id: Math.random().toString(36).slice(2),
    role: 'assistant',
    content: replyText,
    ts: Date.now(),
  };
  await store.appendMessage(assistant);
  return assistant;
});

// Settings IPC
ipcMain.handle('settings:get', async () => {
  const s = await readSettings();
  return sanitize(s);
});
ipcMain.handle('settings:updateProvider', async (_e, name: any, cfg: any) => {
  const s = await updateProvider(name, cfg);
  return sanitize(s);
});
ipcMain.handle('settings:setActive', async (_e, name: any) => {
  const s = await setActiveProvider(name);
  return sanitize(s);
});

// MCP server management
ipcMain.handle('mcp:getServers', async () => listMCPServers());
ipcMain.handle('mcp:upsertServer', async (_e, server) => upsertMCPServer(server));
ipcMain.handle('mcp:removeServer', async (_e, name: string) => removeMCPServer(name));
ipcMain.handle('mcp:setDefault', async (_e, name?: string) => setDefaultMCPServer(name));
ipcMain.handle('mcp:listTools', async (_e, serverOrName?: string) =>
  listMCPTools(await resolveMCPServer(serverOrName)),
);
