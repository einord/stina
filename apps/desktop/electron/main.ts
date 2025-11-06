
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
import electron, { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createProvider } from './providers/index.js';

const { app, ipcMain } = electron;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win: BrowserWindow | null = null;

async function createWindow() {
  const isMac = process.platform === 'darwin';
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 800,
    height: 600,
    backgroundColor: isMac ? '#f7f7f8' : undefined,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    titleBarOverlay: isMac ? { color: '#00000000', height: 40 } : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
    },
  };

  win = new BrowserWindow(windowOptions);

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

async function routeToProviderStream(
  prompt: string,
  history: ChatMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const s = await readSettings();
  const active = s.active;
  if (!active) return 'No provider selected in Settings.';
  try {
    const provider = createProvider(active, s.providers);
    if (provider.sendStream) return await provider.sendStream(prompt, history, onDelta, signal);
    // fallback: non-streaming
    const full = await provider.send(prompt, history);
    onDelta(full);
    return full;
  } catch (err: any) {
    const msg = `Error: ${err?.message ?? String(err)}`;
    onDelta(msg);
    return msg;
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

const controllers = new Map<string, AbortController>();
ipcMain.handle('chat:cancel', async (_e, id: string) => {
  const c = controllers.get(id);
  if (c) {
    c.abort();
    controllers.delete(id);
    win?.webContents.send('chat-stream', { id, done: true });
    return true;
  }
  return false;
});

ipcMain.handle('chat:send', async (_e, text: string) => {
  const user: ChatMessage = {
    id: Math.random().toString(36).slice(2),
    role: 'user',
    content: text,
    ts: Date.now(),
  };
  await store.appendMessage(user);

  // Stream assistant tokens to renderer first; persist final message after completion
  const assistantId = Math.random().toString(36).slice(2);
  const history = store.getMessages();
  const controller = new AbortController();
  controllers.set(assistantId, controller);
  win?.webContents.send('chat-stream', { id: assistantId, start: true });

  let total = '';
  const sendStreamChunk = (delta: string) => {
    total += delta;
    win?.webContents.send('chat-stream', { id: assistantId, delta });
  };
  let replyText = '';
  try {
    replyText = await routeToProviderStream(text, history, sendStreamChunk, controller.signal);
  } catch (err) {
    if (controller.signal.aborted) {
      // return partial
      replyText = total;
    } else {
      replyText = `Error: ${(err as any)?.message ?? String(err)}`;
    }
  } finally {
    controllers.delete(assistantId);
  }

  if (!controller.signal.aborted) {
    const assistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: replyText,
      ts: Date.now(),
    };
    await store.appendMessage(assistant);
  } else {
    // Persist partial content with aborted flag so UI can render it distinctively
    await store.appendMessage({
      id: assistantId,
      role: 'assistant',
      content: total,
      ts: Date.now(),
      aborted: true,
    } as any);
  }
  // Signal done (optional for UI to clean up)
  win?.webContents.send('chat-stream', { id: assistantId, done: true });
  return { id: assistantId, role: 'assistant', content: replyText, ts: Date.now() } as ChatMessage;
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
