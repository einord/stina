#!/usr/bin/env bun
import blessed from 'blessed';

import { createLayout } from './src/layout.js';
import { updateStatus, type ViewKey } from './src/status.js';
import { getTheme, toggleThemeKey, type ThemeKey } from './src/theme.js';

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

let themeKey: ThemeKey = 'light';
let view: ViewKey = 'chat';
let menuVisible = false;
let todosVisible = false;

const layout = createLayout(screen, getTheme(themeKey));

let chatHistory =
  "{bold}the 2nd December 10:45 AM{/}\n\n🤖  Hi there, how may I assist you?\n🙂  What's next on my agenda?";

layout.main.setContent(chatHistory);
layout.todos.setContent('{bold}Todos{/}\n- Planera dagen\n- Följ upp med teamet');
layout.setTodosVisible(todosVisible);

function renderMainView() {
  switch (view) {
    case 'chat':
      layout.main.setContent(chatHistory);
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
  updateStatus(layout.status, view, themeKey, menuVisible, todosVisible);
  screen.render();
}

function focusAppropriateElement() {
  if (!menuVisible && view === 'chat') {
    layout.input.focus();
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

function toggleMenu() {
  menuVisible = !menuVisible;
  focusAppropriateElement();
  refreshUI();
}

function hideMenu() {
  if (!menuVisible) return;
  menuVisible = false;
  focusAppropriateElement();
  refreshUI();
}

function applyTheme(next: ThemeKey) {
  themeKey = next;
  layout.applyTheme(getTheme(themeKey));
  refreshUI();
}

screen.key(['enter'], () => {
  if (menuVisible || view !== 'chat') return;
  const text = layout.input.getValue();
  if (!text) return;
  chatHistory = `${chatHistory}\n🙂  ${text}`;
  layout.main.setContent(chatHistory);
  layout.input.clearValue();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));

screen.key(['escape'], () => toggleMenu());

screen.key(['q'], () => {
  if (menuVisible) process.exit(0);
});

screen.key(['c'], () => {
  if (!menuVisible) return;
  setView('chat');
  hideMenu();
});

screen.key(['x'], () => {
  if (!menuVisible) return;
  setView('tools');
  hideMenu();
});

screen.key(['s'], () => {
  if (!menuVisible) return;
  setView('settings');
  hideMenu();
});

screen.key(['t'], () => {
  if (!menuVisible) return;
  todosVisible = !todosVisible;
  layout.setTodosVisible(todosVisible);
  hideMenu();
});

screen.key(['T'], () => applyTheme(toggleThemeKey(themeKey)));

// Initialize UI
focusAppropriateElement();
refreshUI();
