import type { Provider as ChatProvider } from '@stina/chat/manager';
import { ChatManager as ChatModuleManager } from '@stina/chat';
import { readSettings } from '@stina/settings';

import { generateNewSessionStartPrompt } from './chat.systemPrompt.js';
import { createProvider } from './providers/index.js';
import { refreshMCPToolCache } from './tools.js';
import { onWarning } from './warnings.js';

/**
 * Core-facing ChatManager that wires provider + tool dependencies into the chat module manager.
 */
export class ChatManager extends ChatModuleManager {
  constructor() {
    super({
      resolveProvider: resolveProviderFromSettings,
      refreshToolCache: refreshMCPToolCache,
      subscribeWarnings: onWarning,
      generateSessionPrompt: generateNewSessionStartPrompt,
    });
  }
}

export type { StreamEvent } from '@stina/chat';

async function resolveProviderFromSettings(): Promise<ChatProvider | null> {
  const settings = await readSettings();
  const active = settings.active;
  if (!active) return null;
  try {
    return createProvider(active, settings.providers);
  } catch (err) {
    console.error('[chat] failed to create provider', err);
    return null;
  }
}
