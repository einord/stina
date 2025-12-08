import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmpDb = path.join(os.tmpdir(), `stina-chat-idle-${Date.now()}.db`);
let ChatManager: typeof import('../manager.ts')['ChatManager'];
let getChatRepository: typeof import('../repository.ts')['getChatRepository'];

describe('chat idle notices', () => {
  beforeEach(async () => {
    fs.rmSync(tmpDb, { force: true });
    process.env.STINA_DB_PATH = tmpDb;
    if (typeof vi.resetModules === 'function') {
      vi.resetModules();
    }
    vi.restoreAllMocks();
    const chatModule = await import('../index.js');
    ChatManager = chatModule.ChatManager;
    getChatRepository = chatModule.getChatRepository;
  });

  it('adds system info when user returns after a long gap', async () => {
    const now = { value: Date.now() };
    vi.spyOn(Date, 'now').mockImplementation(() => now.value);
    const repo = getChatRepository();
    const manager = new ChatManager({
      resolveProvider: async () => ({
        name: 'mock',
        send: async () => 'ok',
      }),
      readSettings: async () => ({
        desktop: { language: 'sv' },
        userProfile: { firstName: 'Test', nickname: undefined },
      } as unknown as ReturnType<typeof import('@stina/settings').readSettings>),
    });

    now.value = new Date('2025-10-05T10:00:00Z').getTime();
    await manager.sendMessage('Hej där');

    now.value = new Date('2025-10-05T15:05:00Z').getTime();
    await manager.sendMessage('Tillbaka efter en paus');

    const messages = await repo.getMessagesForConversation(await repo.getCurrentConversationId());
    const infoMessages = messages.filter((m) => m.role === 'info');

    expect(infoMessages.length).toBe(2);
    expect(infoMessages[0]?.content).toMatch(/SystemInformation/i);
    expect(infoMessages[1]?.content).toMatch(/system message|systemmeddelande/i);
    expect(infoMessages[0]?.interactionId).toBe(infoMessages[1]?.interactionId);
  });
});
