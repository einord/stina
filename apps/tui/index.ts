#!/usr/bin/env bun
import {
  ChatManager,
  createProvider,
  setToolLogger,
  generateNewSessionStartPrompt,
  buildPromptPrelude,
} from '@stina/core';
import { readSettings } from '@stina/settings';
import type { Interaction, InteractionMessage } from '@stina/chat';
import { t } from '@stina/i18n';
import blessed from 'blessed';

import { createLayout } from './src/layout.js';
import { type ViewKey, updateStatus } from './src/status.js';
import { type ThemeKey, getTheme, toggleThemeKey } from './src/theme.js';

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

let themeKey: ThemeKey = 'light';
let view: ViewKey = 'chat';
let menuVisible = false;
let todosVisible = false;
let calendarVisible = false;
let chatAutoScroll = true;
let warningMessage: string | null = null;
let isDebugMode = false;

const layout = createLayout(screen, getTheme(themeKey));
const navItems = [
  { key: 'chat', label: t('tui.nav_chat') },
  { key: 'tools', label: t('tui.nav_tools') },
  { key: 'settings', label: t('tui.nav_settings') },
];
(layout.nav as unknown as { viewKeys?: string[] }).viewKeys = navItems.map((item) => item.key);
layout.nav.setItems(navItems.map((item) => item.label));
layout.nav.select(0);
layout.nav.on('select', (_item, idx) => {
  const next = navItems[idx]?.key;
  if (!next) return;
  setView(next as ViewKey);
  closeMenu();
});

const input = layout.input;
layout.todos.setContent(`{bold}${t('tui.todos_placeholder_title')}{/}\n${t('tui.todos_placeholder_body')}`);
layout.calendar.setContent(
  `{bold}${t('tui.calendar_placeholder_title')}{/}\n${t('tui.calendar_placeholder_body')}`,
);
layout.setTodosVisible(todosVisible);
layout.setCalendarVisible(calendarVisible);

setToolLogger(() => {});

const chat = new ChatManager({
  resolveProvider: resolveProviderFromSettings,
  generateSessionPrompt: generateNewSessionStartPrompt,
  buildPromptPrelude: buildPromptPreludeFromSettings,
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
function formatChatMessage(msg: InteractionMessage, abortedInteraction = false): string | null {
  if (!isDebugMode && (msg.role === 'instructions' || msg.role === 'debug')) {
    return null;
  }

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
      const formatted = formatChatMessage(msg, interaction.aborted === true);
      if (formatted) {
        parts.push(formatted);
      }
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
  updateStatus(layout.status, view, themeKey, menuVisible, todosVisible, calendarVisible, warningMessage);
  screen.render();
}

/**
 * Chooses whether focus should sit on the chat input or the status/menu.
 */
function focusAppropriateElement() {
  if (menuVisible) {
    layout.nav.focus();
    return;
  }
  if (view === 'chat') {
    input.focus();
    return;
  }
  layout.status.focus();
}

/**
 * Changes the active view and refreshes any dependent UI state.
 */
function setView(next: ViewKey) {
  view = next;
  layout.setView(next);
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
  layout.nav.focus();
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
  setView('chat');
  closeMenu();
});

screen.key(['x'], () => {
  setView('tools');
  closeMenu();
});

screen.key(['s'], () => {
  setView('settings');
  closeMenu();
});

screen.key(['t'], () => {
  todosVisible = !todosVisible;
  layout.setTodosVisible(todosVisible);
  refreshUI();
});

screen.key(['k'], () => {
  calendarVisible = !calendarVisible;
  layout.setCalendarVisible(calendarVisible);
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
  const msg =
    typeof warning === 'object' && warning && 'message' in warning
      ? (warning as { message?: string }).message
      : undefined;
  warningMessage = msg ?? warningMessage;
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
  warningMessage =
    warnings.find(
      (w): w is { type?: string; message?: string } =>
        typeof w === 'object' && !!w && 'type' in w && (w as { type?: string }).type === 'tools-disabled',
    )?.message ?? warningMessage;
  renderMainView();
  focusAppropriateElement();
  refreshUI();
}

void bootstrap();

async function resolveProviderFromSettings() {
  const settings = await readSettings();
  isDebugMode = settings.advanced?.debugMode ?? false;
  chat.setDebugMode(isDebugMode);

  const active = settings.active;
  if (!active) return null;
  try {
    return createProvider(active, settings.providers);
  } catch (err) {
    console.error('[tui] failed to create provider', err);
    return null;
  }
}

/**
 * Builds a persisted prompt prelude using the current settings.
 */
async function buildPromptPreludeFromSettings(context: { conversationId: string }) {
  const settings = await readSettings();
  return buildPromptPrelude(settings, context.conversationId);
}
