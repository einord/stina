import { EventEmitter } from 'node:events';
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type ChatRole = 'user' | 'assistant' | 'info';
export type ChatMessage = { id: string; role: ChatRole; content: string; ts: number };
export type State = { count: number; messages: ChatMessage[] };

const MAX_MESSAGES = 50;

const ensureDir = async (dir: string) => {
  await fsp.mkdir(dir, { recursive: true });
};

const defaultState: State = { count: 0, messages: [] };

const getStateFilePath = () => {
  const dir = path.join(os.homedir(), '.stina');
  const file = path.join(dir, 'state.json');
  return { dir, file };
};

function coerceState(parsed: any): State {
  const count = typeof parsed?.count === 'number' ? parsed.count : 0;
  const msgs = Array.isArray(parsed?.messages) ? parsed.messages as ChatMessage[] : [];
  return { count, messages: msgs };
}

async function readState(): Promise<State> {
  const { dir, file } = getStateFilePath();
  await ensureDir(dir);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return coerceState(parsed);
  } catch {}
  await fsp.writeFile(file, JSON.stringify(defaultState, null, 2), 'utf8');
  return { ...defaultState };
}

async function writeState(state: State): Promise<void> {
  const { dir, file } = getStateFilePath();
  await ensureDir(dir);
  await fsp.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
}

function uid() { return Math.random().toString(36).slice(2, 10); }

class Store extends EventEmitter {
  private state: State = { ...defaultState };
  private watching = false;
  private lastEmitted = JSON.stringify(this.state);

  constructor() {
    super();
    void this.init();
  }

  private async init() {
    this.state = await readState();
    this.lastEmitted = JSON.stringify(this.state);
    this.setupWatch();
  }

  private setupWatch() {
    if (this.watching) return;
    const { file } = getStateFilePath();
    try {
      fs.watch(file, { persistent: false }, async () => {
        try {
          const s = await readState();
          const next = JSON.stringify(s);
          if (next !== this.lastEmitted) {
            this.state = s;
            this.lastEmitted = next;
            this.emit('change', this.state.count);
            this.emit('messages', this.state.messages);
          }
        } catch {}
      });
      this.watching = true;
    } catch {}
  }

  // Counter API (legacy)
  getCount(): number { return this.state.count; }
  async increment(by = 1): Promise<number> {
    this.state.count += by;
    await writeState(this.state);
    this.lastEmitted = JSON.stringify(this.state);
    this.emit('change', this.state.count);
    return this.state.count;
  }

  // Chat API
  getMessages(): ChatMessage[] { return this.state.messages; }
  async appendMessage(msg: Omit<ChatMessage, 'id' | 'ts'> & Partial<Pick<ChatMessage,'id'|'ts'>>): Promise<ChatMessage> {
    const m: ChatMessage = { id: msg.id ?? uid(), ts: msg.ts ?? Date.now(), role: msg.role, content: msg.content };
    this.state.messages.push(m);
    if (this.state.messages.length > MAX_MESSAGES) {
      this.state.messages = this.state.messages.slice(-MAX_MESSAGES);
    }
    await writeState(this.state);
    this.lastEmitted = JSON.stringify(this.state);
    this.emit('messages', this.state.messages);
    return m;
  }
  async clearMessages() {
    this.state.messages = [];
    await writeState(this.state);
    this.lastEmitted = JSON.stringify(this.state);
    this.emit('messages', this.state.messages);
  }

  subscribe(listener: (count: number) => void): () => void {
    this.on('change', listener);
    // Emit current on subscribe for convenience
    queueMicrotask(() => listener(this.state.count));
    return () => this.off('change', listener);
  }

  onMessages(listener: (messages: ChatMessage[]) => void): () => void {
    this.on('messages', listener);
    queueMicrotask(() => listener(this.state.messages));
    return () => this.off('messages', listener);
  }
}

const store = new Store();
export default store;
export type { State as StoreState };
