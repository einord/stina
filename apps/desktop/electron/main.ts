import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import store, { ChatMessage } from '@stina/store';
import { readSettings } from '@stina/settings';

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
    if (active === 'openai') return await callOpenAI(prompt, history, s.providers.openai);
    if (active === 'anthropic') return await callAnthropic(prompt, history, s.providers.anthropic);
    if (active === 'gemini') return await callGemini(prompt, history, s.providers.gemini);
    if (active === 'ollama') return await callOllama(prompt, history, s.providers.ollama);
    return 'Unsupported provider.';
  } catch (err: any) {
    return `Error: ${err?.message ?? String(err)}`;
  }
}

function toChatHistory(history: ChatMessage[]) {
  // Use only messages since last 'info' marker to reset model context between sessions
  let start = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'info') { start = i + 1; break; }
  }
  return history
    .slice(start)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20);
}

async function callOpenAI(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const key = cfg?.apiKey; if (!key) throw new Error('OpenAI API key missing');
  const base = cfg?.baseUrl ?? 'https://api.openai.com/v1';
  const model = cfg?.model ?? 'gpt-4o-mini';
const msgs = toChatHistory(history).map((m: any) => ({ role: m.role, content: m.content }));
  const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: msgs }) });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const j: any = await res.json();
  return j.choices?.[0]?.message?.content ?? '(no content)';
}

async function callAnthropic(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const key = cfg?.apiKey; if (!key) throw new Error('Anthropic API key missing');
  const base = cfg?.baseUrl ?? 'https://api.anthropic.com';
  const model = cfg?.model ?? 'claude-3-5-haiku-latest';
const msgs = toChatHistory(history).map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
  const res = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, max_tokens: 1024 }) });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const j: any = await res.json();
  const text = j.content?.[0]?.text ?? j.content?.map((c: any)=>c.text).join('');
  return text ?? '(no content)';
}

async function callGemini(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const key = cfg?.apiKey; if (!key) throw new Error('Gemini API key missing');
  const model = (cfg?.model ?? 'gemini-1.5-flash');
  const base = cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
const contents = toChatHistory(history).map(m => ({ role: m.role, parts: [{ text: m.content }] }));
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents }) });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const j: any = await res.json();
  return j.candidates?.[0]?.content?.parts?.map((p: any)=>p.text).join('') ?? '(no content)';
}

async function callOllama(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const host = cfg?.host ?? 'http://localhost:11434';
  const model = cfg?.model ?? 'llama3.1:8b';
const messages = toChatHistory(history).map(m => ({ role: m.role, content: m.content }));
  const res = await fetch(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false }) });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const j: any = await res.json();
  return j?.message?.content ?? '(no content)';
}

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
  const msg: ChatMessage = { id: Math.random().toString(36).slice(2), role: 'info', content: `New session • ${new Date().toLocaleString()}` , ts: now };
  await store.appendMessage(msg);
  return store.getMessages();
});
ipcMain.handle('chat:send', async (_e, text: string) => {
  const user: ChatMessage = { id: Math.random().toString(36).slice(2), role: 'user', content: text, ts: Date.now() };
  await store.appendMessage(user);
  const replyText = await routeToProvider(text, store.getMessages());
  const assistant: ChatMessage = { id: Math.random().toString(36).slice(2), role: 'assistant', content: replyText, ts: Date.now() };
  await store.appendMessage(assistant);
  return assistant;
});

// Settings IPC
import { readSettings, updateProvider, setActiveProvider, sanitize } from '@stina/settings';
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
