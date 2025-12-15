#!/usr/bin/env bun
import { setToolLogger } from '@stina/core';
import { readSettings } from '@stina/settings';
import { getTodoRepository } from '@stina/work';
import { getCalendarRepository } from '@stina/calendar';
import type { Interaction } from '@stina/chat';
import { t, initI18n } from '@stina/i18n';
import blessed from 'blessed';
import wcwidth from 'wcwidth';

import { createLayout } from './src/layout.js';
import { renderChatView, renderMainView } from './src/render.js';
import { registerKeybindings } from './src/keys.js';
import { type ViewKey, updateStatus } from './src/status.js';
import { type ThemeKey, getTheme, toggleThemeKey } from './src/theme.js';
import { loadCalendar, loadTodos, subscribeCalendar, subscribeTodos } from './src/data.js';
import { createChat } from './src/chat.js';
import {
  getState,
  setCalendarVisible,
  setChatAutoScroll,
  setDebugMode,
  setInteractions,
  setMenuVisible,
  setNavViewKeys,
  getNavViewKeys,
  setThemeKey,
  setTodosVisible,
  setView as setViewState,
  setWarningMessage,
} from './src/state.js';

const initialSettings = await readSettings();
const initialLang = initialSettings.desktop?.language ?? process.env.LANG;
initI18n(initialLang?.slice(0, 2));

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI', fullUnicode: true });
// Ensure the program treats emoji and other wide chars correctly for width calculations.
// Blessed typings are conservative; these flags exist at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(screen.program as any).unicode = true;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(screen.program as any).useUnicode = true;
// Some terminals need this flag as well to avoid width drift when printing wide characters.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(screen as any).options.fullUnicode = true;
// Blessed ships its own width table; patch to wcwidth for more accurate emoji widths.
type BlessedUnicode = {
  charWidth: (input: string | number, index?: number) => number;
  strWidth: (input: string) => number;
};
const blessedUnicode = (blessed as unknown as { unicode: BlessedUnicode }).unicode;
blessedUnicode.charWidth = (input: string | number, index = 0) => {
  const code =
    typeof input === 'number'
      ? input
      : typeof input === 'string'
        ? input.codePointAt(index) ?? 0
        : 0;
  const width = wcwidth(String.fromCodePoint(code));
  return width < 0 ? 0 : width;
};
blessedUnicode.strWidth = (input: string) => {
  let width = 0;
  for (let i = 0; i < input.length; i++) {
    const code = input.codePointAt(i);
    if (code === undefined) continue;
    const w = wcwidth(String.fromCodePoint(code));
    width += w < 0 ? 0 : w;
    if (code > 0xffff) i++;
  }
  return width;
};

const state = getState();
let themeKey: ThemeKey = state.themeKey;
let view: ViewKey = state.view;
let menuVisible = state.menuVisible;
let todosVisible = state.todosVisible;
let calendarVisible = state.calendarVisible;
let chatAutoScroll = state.chatAutoScroll;
let warningMessage: string | null = state.warningMessage;
let isDebugMode = state.isDebugMode;

const layout = createLayout(screen, getTheme(themeKey));
const navItems = [
  { key: 'chat', label: t('tui.nav_chat') },
  { key: 'tools', label: t('tui.nav_tools') },
  { key: 'settings', label: t('tui.nav_settings') },
];
setNavViewKeys(navItems.map((item) => item.key));
layout.nav.setItems(navItems.map((item) => item.label));
layout.nav.select(0);
layout.nav.on('select', (_item, idx) => {
  const next = getNavViewKeys()[idx];
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

const chat = createChat({
  onInteractions: (list) => {
    setInteractions(list);
    interactions = list;
    if (view === 'chat') {
      renderChat();
      refreshUI();
    }
  },
  onStream: (event) => {
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
      renderChat();
      refreshUI();
    }
  },
  onWarning: (warning) => {
    const msg =
      typeof warning === 'object' && warning && 'message' in warning
        ? (warning as { message?: string }).message
        : undefined;
    warningMessage = msg ?? warningMessage;
    setWarningMessage(warningMessage);
    refreshUI();
  },
  setDebugMode: (enabled) => {
    isDebugMode = enabled;
    setDebugMode(enabled);
  },
});
let interactions: Interaction[] = [];
const todoRepo = getTodoRepository();
const calendarRepo = getCalendarRepository();
let todoUnsub: (() => void) | null = null;
let calendarUnsub: (() => void) | null = null;
void chat.getInteractions().then((initial) => {
  interactions = initial;
  setInteractions(initial);
  renderView();
});
const streamBuffers = new Map<string, string>();

const renderChat = () =>
  renderChatView({
    interactions,
    streamBuffers,
    layout,
    chatAutoScroll,
    isDebugMode,
  });

const renderView = () => renderMainView(view, renderChat, layout);

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
  setViewState(next);
  layout.setView(next);
  renderView();
  focusAppropriateElement();
  refreshUI();
}

/**
 * Shows the command menu overlay if it is not already visible.
 */
function openMenu() {
  if (menuVisible) return;
  menuVisible = true;
  setMenuVisible(true);
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
  setMenuVisible(false);
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
  setThemeKey(next);
  layout.applyTheme(getTheme(themeKey));
  renderView();
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

registerKeybindings({
  screen,
  input,
  layout,
  getView: () => view,
  setView,
  toggleMenu,
  openMenu,
  closeMenu,
  isMenuVisible: () => menuVisible,
  toggleTodos: () => {
    todosVisible = !todosVisible;
    setTodosVisible(todosVisible);
    layout.setTodosVisible(todosVisible);
    refreshUI();
  },
  toggleCalendar: () => {
    calendarVisible = !calendarVisible;
    setCalendarVisible(calendarVisible);
    layout.setCalendarVisible(calendarVisible);
    refreshUI();
  },
  applyThemeToggle: () => applyTheme(toggleThemeKey(themeKey)),
  scrollChat,
  pageSize,
});

chat.onInteractions((list) => {
  interactions = list;
  setInteractions(list);
  if (view === 'chat') {
    renderChat();
    refreshUI();
  }
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
    setChatAutoScroll(true);
  } else if (delta < 0) {
    chatAutoScroll = false;
    setChatAutoScroll(false);
  }
  screen.render();
}

/**
 * Ensures the UI starts with a session, loads warnings, and renders the first frame.
 */
async function bootstrap() {
  const settings = await readSettings();
  const hasActiveProvider = Boolean(settings.active);
  const hasSession = interactions.some((i) => i.messages.some((m) => m.role === 'info'));

  if (!hasSession && hasActiveProvider) {
    await chat.newSession();
    interactions = await chat.getInteractions();
  }

  const runLoadTodos = () => loadTodos(todoRepo, layout);
  const runLoadCalendar = () => loadCalendar(calendarRepo, layout);

  await Promise.all([runLoadTodos(), runLoadCalendar()]);
  todoUnsub = subscribeTodos(todoRepo, runLoadTodos);
  calendarUnsub = subscribeCalendar(calendarRepo, runLoadCalendar);

  const warnings = chat.getWarnings();
  warningMessage =
    warnings.find(
      (w): w is { type?: string; message?: string } =>
        typeof w === 'object' && !!w && 'type' in w && (w as { type?: string }).type === 'tools-disabled',
    )?.message ?? warningMessage;
  renderView();
  focusAppropriateElement();
  refreshUI();
}

void bootstrap();
