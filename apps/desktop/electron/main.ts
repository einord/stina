import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import store, { ChatMessage } from '@stina/store';
import { readSettings } from '@stina/settings';

// Tool spec: console_log
const toolSpecs = {
  openai: [{
    type: 'function',
    function: {
      name: 'console_log',
      description: 'Log a message to the Stina console for debugging/observability.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_call',
      description: 'Call a tool on an external MCP server over WebSocket.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string', description: 'ws:// URL of the MCP server' },
          tool: { type: 'string' },
          args: { type: 'object' }
        },
        required: ['server','tool']
      }
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_list',
      description: 'List available tools on an external MCP server.',
      parameters: {
        type: 'object',
        properties: { server: { type: 'string', description: 'ws:// URL of the MCP server' } },
        required: ['server']
      }
    }
  }],
  anthropic: [{
    name: 'console_log',
    description: 'Log a message to the Stina console for debugging/observability.',
    input_schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message']
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_call',
      description: 'Call a tool on an external MCP server over WebSocket.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string' },
          tool: { type: 'string' },
          args: { type: 'object' }
        },
        required: ['server','tool']
      }
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_list',
      description: 'List available tools on an external MCP server.',
      parameters: {
        type: 'object',
        properties: { server: { type: 'string' } },
        required: ['server']
      }
    }
  }],
  gemini: [{
    functionDeclarations: [{
      name: 'console_log',
      description: 'Log a message to the Stina console for debugging/observability.',
      parameters: {
        type: 'OBJECT',
        properties: { message: { type: 'STRING' } },
        required: ['message']
      }
    }]
  }],
  ollama: [{
    type: 'function',
    function: {
      name: 'console_log',
      description: 'Log a message to the Stina console for debugging/observability.',
      parameters: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message']
      }
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_call',
      description: 'Call a tool on an external MCP server over WebSocket.',
      parameters: {
        type: 'object',
        properties: {
          server: { type: 'string' },
          tool: { type: 'string' },
          args: { type: 'object' }
        },
        required: ['server','tool']
      }
    }
  },{
    type: 'function',
    function: {
      name: 'mcp_list',
      description: 'List available tools on an external MCP server.',
      parameters: {
        type: 'object',
        properties: { server: { type: 'string' } },
        required: ['server']
      }
    }
  }]
} as const;

import { callMCPTool, listMCPTools } from '@stina/mcp';
async function runTool(name: string, args: any) {
  if (name === 'console_log') {
    const msg = typeof args?.message === 'string' ? args.message : String(args);
    console.log('[tool:console_log]', msg);
    return { ok: true };
  }
  if (name === 'mcp_call') {
    const serverInput = args?.server ?? args?.url;
    const tool = args?.tool ?? args?.name;
    const targs = args?.args ?? args?.arguments ?? {};
    if (!tool) return { ok: false, error: 'mcp_call requires { tool }' };
    const url = await resolveMCPServer(serverInput);
    if (url.startsWith('local://')) {
      if (tool === 'console_log') {
        const msg = typeof targs?.message === 'string' ? targs.message : String(targs?.message ?? '');
        console.log('[tool:console_log]', msg);
        return { ok: true };
      }
      return { ok: false, error: `Unknown local tool ${tool}` };
    }
    return callMCPTool(url, tool, targs);
  }
  if (name === 'mcp_list') {
    const serverInput = args?.server ?? args?.url;
    const url = await resolveMCPServer(serverInput);
    if (url.startsWith('local://')) {
      return { tools: [
        { name: 'console_log', description: 'Log a message to the Stina console.', parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
      ] };
    }
    return listMCPTools(url);
  }
  return { ok: false, error: `Unknown tool ${name}` };
}

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
  // First call with tools enabled
  let res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, tools: toolSpecs.openai }) });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  let j: any = await res.json();
  const msg = j.choices?.[0]?.message;
  const toolCalls = msg?.tool_calls ?? [];
  if (toolCalls.length > 0) {
    const toolResults = [] as any[];
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}
      const result = await runTool(name, args);
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    const msgs2 = [...msgs, msg, ...toolResults];
    res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: msgs2, tools: toolSpecs.openai }) });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    j = await res.json();
    return j.choices?.[0]?.message?.content ?? '(no content)';
  }
  return msg?.content ?? '(no content)';
}

async function callAnthropic(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const key = cfg?.apiKey; if (!key) throw new Error('Anthropic API key missing');
  const base = cfg?.baseUrl ?? 'https://api.anthropic.com';
  const model = cfg?.model ?? 'claude-3-5-haiku-latest';
  const msgs = toChatHistory(history).map(m => ({ role: m.role, content: [{ type: 'text', text: m.content }] }));
  // First call with tools
  let res = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: msgs, max_tokens: 1024, tools: toolSpecs.anthropic }) });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  let j: any = await res.json();
  const content: any[] = j.content ?? [];
  const toolUses = content.filter((c: any) => c.type === 'tool_use');
  if (toolUses.length > 0) {
    const toolResults = await Promise.all(toolUses.map(async (tu: any) => {
      const res = await runTool(tu.name, tu.input);
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(res) };
    }));
    const messages2 = [...msgs, { role: 'assistant', content }, { role: 'user', content: toolResults }];
    res = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: messages2, max_tokens: 1024, tools: toolSpecs.anthropic }) });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    j = await res.json();
  }
  const text = j.content?.[0]?.text ?? j.content?.map((c: any)=>c.text).join('');
  return text ?? '(no content)';
}

async function callGemini(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const key = cfg?.apiKey; if (!key) throw new Error('Gemini API key missing');
  const model = (cfg?.model ?? 'gemini-1.5-flash');
  const base = cfg?.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  const contents = toChatHistory(history).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  // First call with tools
  let res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents, tools: toolSpecs.gemini }) });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  let j: any = await res.json();
  const parts: any[] = j.candidates?.[0]?.content?.parts ?? [];
  const calls = parts.filter(p => p.functionCall);
  if (calls.length > 0) {
    const responseParts = await Promise.all(calls.map(async (c: any) => ({ functionResponse: { name: c.functionCall.name, response: await runTool(c.functionCall.name, c.functionCall.args) } })));
    const contents2 = [...contents, { role: 'model', parts }, { role: 'user', parts: responseParts }];
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: contents2, tools: toolSpecs.gemini }) });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    j = await res.json();
  }
  return j.candidates?.[0]?.content?.parts?.map((p: any)=>p.text).join('') ?? '(no content)';
}

async function callOllama(prompt: string, history: ChatMessage[], cfg?: any): Promise<string> {
  const host = cfg?.host ?? 'http://localhost:11434';
  const model = cfg?.model ?? 'llama3.1:8b';
  const messages = toChatHistory(history).map(m => ({ role: m.role, content: m.content }));
  // First call with tools
  let res = await fetch(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false, tools: toolSpecs.ollama }) });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  let j: any = await res.json();
  const msg = j?.message;
  const toolCalls = msg?.tool_calls ?? [];
  if (toolCalls.length > 0) {
    const toolResults = [] as any[];
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}
      const result = runTool(name, args);
      toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    const messages2 = [...messages, msg, ...toolResults];
    res = await fetch(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: messages2, stream: false, tools: toolSpecs.ollama }) });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    j = await res.json();
  }
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
import { readSettings, updateProvider, setActiveProvider, sanitize, listMCPServers, upsertMCPServer, removeMCPServer, setDefaultMCPServer, resolveMCPServer } from '@stina/settings';
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
ipcMain.handle('mcp:listTools', async (_e, serverOrName?: string) => listMCPTools(await resolveMCPServer(serverOrName)));
