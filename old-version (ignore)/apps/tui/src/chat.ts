import {
  ChatManager,
  createProvider,
  generateNewSessionStartPrompt,
  buildPromptPrelude,
} from '@stina/core';
import type { Interaction } from '@stina/chat';
import { readSettings } from '@stina/settings';

type ChatDeps = {
  onInteractions: (list: Interaction[]) => void;
  onStream: (event: { id: string; start?: boolean; delta?: string; done?: boolean }) => void;
  onWarning: (warning: unknown) => void;
  setDebugMode: (enabled: boolean) => void;
};

export function createChat(deps: ChatDeps) {
  const chat = new ChatManager({
    resolveProvider: resolveProviderFromSettings(deps.setDebugMode),
    generateSessionPrompt: generateNewSessionStartPrompt,
    buildPromptPrelude: buildPromptPreludeFromSettings,
  });

  chat.onInteractions(deps.onInteractions);
  chat.onStream(deps.onStream);
  chat.onWarning(deps.onWarning);

  return chat;
}

function resolveProviderFromSettings(setDebugMode: (enabled: boolean) => void) {
  return async () => {
    const settings = await readSettings();
    const isDebug = settings.advanced?.debugMode ?? false;
    setDebugMode(isDebug);
    // ChatManager instance not in scope here; the caller sets debug mode via setDebugMode.

    const active = settings.active;
    if (!active) return null;
    try {
      return createProvider(active, settings.providers);
    } catch (err) {
      console.error('[tui] failed to create provider', err);
      return null;
    }
  };
}

async function buildPromptPreludeFromSettings(context: { conversationId: string }) {
  const settings = await readSettings();
  return buildPromptPrelude(settings, context.conversationId);
}
