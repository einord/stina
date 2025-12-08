import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDb = path.join(os.tmpdir(), `stina-chat-test-${Date.now()}.db`);
let ChatManager: typeof import('../manager.ts')['ChatManager'];
let getChatRepository: typeof import('../repository.ts')['getChatRepository'];

describe('chat smoke', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    if (typeof vi.resetModules === 'function') {
      vi.resetModules();
    }
    const chatModule = await import('../index.js');
    ChatManager = chatModule.ChatManager;
    getChatRepository = chatModule.getChatRepository;
  });

  it('creates conversations and appends messages', async () => {
    const repo = getChatRepository();
    const manager = new ChatManager();
    const convoId = await repo.getCurrentConversationId();
    expect(convoId).toBeTruthy();

    const info = await repo.appendInfoMessage('hello');
    expect(info.content).toBe('hello');

    const interactions = await repo.getInteractions();
    expect(interactions.length).toBeGreaterThan(0);
    expect(interactions[0]?.messages.length).toBeGreaterThan(0);

    // ChatManager send without provider should yield error message
    const msg = await manager.sendMessage('hi');
    expect(msg.role).toBe('error');
  });
});
