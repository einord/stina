#!/usr/bin/env bun
import { ChatManager, setToolLogger } from '@stina/core';
import type { ChatMessage } from '@stina/store';
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

const chat = new ChatManager();
let messages: ChatMessage[] = chat.getMessages();
const streamBuffers = new Map<string, string>();

function formatChatMessage(msg: ChatMessage): string {
  if (msg.role === 'info') {
    return `{center}${msg.content}{/center}`;
  }
  const icon = msg.role === 'user' ? '🙂' : '🤖';
  const suffix = msg.aborted ? ' (avbrutet)' : '';
  return `${icon}  ${msg.content}${suffix}`;
}

function renderChatView() {
  const parts: string[] = [];
  for (const msg of messages) {
    parts.push(formatChatMessage(msg));
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

function refreshUI() {
  updateStatus(layout.status, view, themeKey, menuVisible, todosVisible, warningMessage);
  screen.render();
}

function focusAppropriateElement() {
  if (!menuVisible && view === 'chat') {
    input.focus();
  } else {
    layout.status.focus();
  }
}

function setView(next: ViewKey) {
  view = next;
  renderMainView();
  focusAppropriateElement();
  refreshUI();
}

function openMenu() {
  if (menuVisible) return;
  menuVisible = true;
  focusAppropriateElement();
  refreshUI();
}

function closeMenu() {
  if (!menuVisible) return;
  menuVisible = false;
  focusAppropriateElement();
  refreshUI();
}

function toggleMenu() {
  if (menuVisible) closeMenu();
  else openMenu();
}

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

chat.onMessages((msgs) => {
  messages = msgs;
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

function pageSize(): number {
  const h = layout.main.height;
  if (typeof h === 'number') return Math.max(1, h - 1);
  const screenHeight = typeof screen.height === 'number' ? screen.height : 0;
  return Math.max(1, screenHeight - 5);
}

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

async function bootstrap() {
  if (!messages.some((m) => m.role === 'info')) {
    await chat.newSession();
    messages = chat.getMessages();
  }
  const warnings = chat.getWarnings();
  warningMessage = warnings.find((w) => w.type === 'tools-disabled')?.message ?? warningMessage;
  renderMainView();
  focusAppropriateElement();
  refreshUI();
}

void bootstrap();
