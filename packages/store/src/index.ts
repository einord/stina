import { EventEmitter } from 'node:events';
import { promises as fsp } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type State = { count: number };

const ensureDir = async (dir: string) => {
  await fsp.mkdir(dir, { recursive: true });
};

const defaultState: State = { count: 0 };

const getStateFilePath = () => {
  const dir = path.join(os.homedir(), '.stina');
  const file = path.join(dir, 'state.json');
  return { dir, file };
};

async function readState(): Promise<State> {
  const { dir, file } = getStateFilePath();
  await ensureDir(dir);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed?.count === 'number') return { count: parsed.count };
  } catch {}
  await fsp.writeFile(file, JSON.stringify(defaultState, null, 2), 'utf8');
  return { ...defaultState };
}

async function writeState(state: State): Promise<void> {
  const { dir, file } = getStateFilePath();
  await ensureDir(dir);
  await fsp.writeFile(file, JSON.stringify(state, null, 2), 'utf8');
}

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
          }
        } catch {}
      });
      this.watching = true;
    } catch {}
  }

  getCount(): number {
    return this.state.count;
  }

  async increment(by = 1): Promise<number> {
    const next = { count: this.state.count + by };
    await writeState(next);
    this.state = next;
    const str = JSON.stringify(this.state);
    if (str !== this.lastEmitted) {
      this.lastEmitted = str;
      this.emit('change', this.state.count);
    }
    return this.state.count;
  }

  subscribe(listener: (count: number) => void): () => void {
    this.on('change', listener);
    // Emit current on subscribe for convenience
    queueMicrotask(() => listener(this.state.count));
    return () => this.off('change', listener);
  }
}

const store = new Store();
export default store;