#!/usr/bin/env bun
import { ChatManager, createProvider, setToolLogger } from '@stina/core';
import { readSettings } from '@stina/settings';
import type { Interaction, InteractionMessage } from '@stina/chat';
import blessed from 'blessed';

import { createLayout } from './src/layout.js';
import { type ViewKey, updateStatus } from './src/status.js';
import { type ThemeKey, getTheme, toggleThemeKey } from './src/theme.js';

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

let themeKey: ThemeKey = 'light';
let view: ViewKey = 'chat';
let menuVisible = false;
let todosVisible = false;
let chatAutoScroll = true;
let warningMessage: string | null = null;

const layout = createLayout(screen, getTheme(themeKey));
const input = layout.input;
layout.todos.setContent('{bold}Todos{/}\n[ ] Planera dagen\n[ ] Följ upp med teamet');
layout.setTodosVisible(todosVisible);

setToolLogger(() => {});

const chat = new ChatManager({
  resolveProvider: resolveProviderFromSettings,
});
let interactions: Interaction[] = [];
void chat.getInteractions().then((initial) => {
  interactions = initial;
  renderMainView();
});
const streamBuffers = new Map<string, string>();

/**
 * Formats a chat message into a Blessed-friendly string with icons and metadata.
 */
function formatChatMessage(msg: InteractionMessage, abortedInteraction = false): string {
  if (msg.role === 'info') {
    return `{center}${msg.content}{/center}`;
  }
  const icon = msg.role === 'user' ? '🙂' : '🤖';
  const suffix = abortedInteraction ? ' (avbrutet)' : '';
  return `${icon}  ${msg.content}${suffix}`;
}

/**
 * Renders the chat transcript (including streaming placeholders) into the main pane.
 */
function renderChatView() {
  const parts: string[] = [];
  for (const interaction of interactions) {
    for (const msg of interaction.messages) {
      parts.push(formatChatMessage(msg, interaction.aborted === true));
    }
  }
  for (const [, text] of streamBuffers.entries()) {
    const display = text || '…';
    parts.push(`🤖  ${display} ▌`);
  }
  layout.main.setContent(parts.length > 0 ? parts.join('\n\n') : 'Inga meddelanden ännu.');
  if (chatAutoScroll) {
    layout.main.setScrollPerc(100);
  }
}

/**
 * Updates the main content area based on the currently selected view.
 */
function renderMainView() {
  switch (view) {
    case 'chat':
      renderChatView();
      break;
    case 'tools':
      layout.main.setContent('{bold}Tools{/}\n\nInga verktyg valda ännu.');
      break;
    case 'settings':
      layout.main.setContent('{bold}Settings{/}\n\nKonfigurera Stina via GUI/TUI i framtiden.');
      break;
  }
}

/**
 * Recomputes status text and triggers a Blessed screen render.
 */
function refreshUI() {
  updateStatus(layout.status, view, themeKey, menuVisible, todosVisible, warningMessage);
  screen.render();
}

/**
 * Chooses whether focus should sit on the chat input or the status/menu.
 */
function focusAppropriateElement() {
  if (!menuVisible && view === 'chat') {
    input.focus();
  } else {
    layout.status.focus();
  }
}

/**
 * Changes the active view and refreshes any dependent UI state.
 */
function setView(next: ViewKey) {
  view = next;
  renderMainView();
  focusAppropriateElement();
  refreshUI();
}

/**
 * Shows the command menu overlay if it is not already visible.
 */
function openMenu() {
  if (menuVisible) return;
  menuVisible = true;
  focusAppropriateElement();
  refreshUI();
}

/**
 * Hides the menu overlay if it is currently visible.
 */
function closeMenu() {
  if (!menuVisible) return;
  menuVisible = false;
  focusAppropriateElement();
  refreshUI();
}

/**
 * Toggles the menu overlay open/closed depending on its current state.
 */
function toggleMenu() {
  if (menuVisible) closeMenu();
  else openMenu();
}

/**
 * Applies a new theme, re-rendering UI content to match.
 */
function applyTheme(next: ThemeKey) {
  themeKey = next;
  layout.applyTheme(getTheme(themeKey));
  renderMainView();
  refreshUI();
}

input.on('submit', (raw) => {
  const text = raw.trim();
  if (!text) {
    input.focus();
    return;
  }
  input.clearValue();
  input.focus();
  void chat.sendMessage(text).catch((err) => {
    console.error('[tui] failed to send message', err);
  });
});

screen.key(['C-c'], () => process.exit(0));

screen.key(['escape'], () => {
  toggleMenu();
});

screen.key(['q'], () => {
  if (menuVisible) process.exit(0);
});

screen.key(['c'], () => {
  if (!menuVisible) return;
  setView('chat');
  closeMenu();
});

screen.key(['x'], () => {
  if (!menuVisible) return;
  setView('tools');
  closeMenu();
});

screen.key(['s'], () => {
  if (!menuVisible) return;
  setView('settings');
  closeMenu();
});

screen.key(['t'], () => {
  if (!menuVisible) return;
  todosVisible = !todosVisible;
  layout.setTodosVisible(todosVisible);
  refreshUI();
});

input.key(['escape'], () => {
  input.cancel();
  openMenu();
});

screen.key(['T'], () => applyTheme(toggleThemeKey(themeKey)));

chat.onInteractions((list) => {
  interactions = list;
  if (view === 'chat') {
    renderChatView();
    refreshUI();
  }
});

chat.onStream((event) => {
  if (event.start) {
    streamBuffers.set(event.id, '');
  }
  if (event.delta) {
    streamBuffers.set(event.id, (streamBuffers.get(event.id) ?? '') + event.delta);
  }
  if (event.done) {
    streamBuffers.delete(event.id);
  }
  if (view === 'chat') {
    renderChatView();
    refreshUI();
  }
});

chat.onWarning((warning) => {
  warningMessage = warning.message ?? warningMessage;
  refreshUI();
});

/**
 * Calculates how many rows the chat view can scroll at once.
 */
function pageSize(): number {
  const h = layout.main.height;
  if (typeof h === 'number') return Math.max(1, h - 1);
  const screenHeight = typeof screen.height === 'number' ? screen.height : 0;
  return Math.max(1, screenHeight - 5);
}

/**
 * Scrolls the chat panel and updates auto-scroll bookkeeping.
 */
function scrollChat(delta: number) {
  if (view !== 'chat') return;
  layout.main.scroll(delta);
  if (delta > 0 && layout.main.getScrollPerc() >= 100) {
    chatAutoScroll = true;
  } else if (delta < 0) {
    chatAutoScroll = false;
  }
  screen.render();
}

screen.key(['pageup'], () => scrollChat(-pageSize()));
screen.key(['pagedown'], () => scrollChat(pageSize()));

input.key(['pageup'], () => scrollChat(-pageSize()));
input.key(['pagedown'], () => scrollChat(pageSize()));

/**
 * Ensures the UI starts with a session, loads warnings, and renders the first frame.
 */
async function bootstrap() {
  if (!interactions.some((i) => i.messages.some((m) => m.role === 'info'))) {
    await chat.newSession();
    interactions = await chat.getInteractions();
  }
  const warnings = chat.getWarnings();
  warningMessage = warnings.find((w) => w.type === 'tools-disabled')?.message ?? warningMessage;
  renderMainView();
  focusAppropriateElement();
  refreshUI();
}

void bootstrap();

async function resolveProviderFromSettings() {
  const settings = await readSettings();
  const active = settings.active;
  if (!active) return null;
  try {
    return createProvider(active, settings.providers);
  } catch (err) {
    console.error('[tui] failed to create provider', err);
    return null;
  }
}
