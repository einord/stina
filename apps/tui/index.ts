#!/usr/bin/env bun
import blessed from 'blessed';

import { createLayout } from './src/layout.js';
import { updateStatus, type ViewKey } from './src/status.js';
import { getTheme, toggleThemeKey, type ThemeKey } from './src/theme.js';

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

let themeKey: ThemeKey = 'light';
let view: ViewKey = 'chat';
let menuVisible = false;

const layout = createLayout(screen, getTheme(themeKey));

layout.chatList.setContent(
  "{bold}the 2nd December 10:45 AM{/}\n\n🤖  Hi there, how may I assist you?\n🙂  What's next on my agenda?",
);

function refreshUI() {
  updateStatus(layout.status, view, themeKey, menuVisible);
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
  layout.chatList.setContent(`${layout.chatList.getContent()}\n🙂  ${text}`);
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

screen.key(['t'], () => {
  if (!menuVisible) return;
  setView('todos');
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

screen.key(['T'], () => applyTheme(toggleThemeKey(themeKey)));

// Initialize UI
focusAppropriateElement();
refreshUI();
