#!/usr/bin/env bun
import blessed from 'blessed';

// Simple theming for TUI
type Theme = { bg: string; fg: string; panel: string; accent: string };
const themes: Record<string, Theme> = {
  light: { bg: 'white', fg: 'black', panel: 'grey', accent: 'cyan' },
  dark: { bg: 'black', fg: 'white', panel: 'grey', accent: 'blue' },
};
let themeKey: keyof typeof themes = 'light';
const theme = () => themes[themeKey];

const screen = blessed.screen({ smartCSR: true, title: 'Stina TUI' });

// Layout: left nav, main content (chat/todos/tools/settings), bottom input
const layout = blessed.layout({ parent: screen, width: '100%', height: '100%', layout: 'inline' });

const nav = blessed.box({
  parent: layout,
  width: 7,
  height: '100%',
  tags: true,
  style: { bg: theme().panel, fg: theme().fg },
  border: { type: 'line' },
});

const navItems = [
  { key: 'c', icon: '💬', name: 'Chat', view: 'chat' },
  { key: 't', icon: '🗒️', name: 'Todos', view: 'todos' },
  { key: 'x', icon: '⛏️', name: 'Tools', view: 'tools' },
  { key: 's', icon: '⚙️', name: 'Settings', view: 'settings' },
] as const;

function renderNav(active: typeof navItems[number]['view']) {
  const lines = navItems.map((item) =>
    item.view === active ? `{bold}{${theme().accent}-fg}${item.icon}{/${theme().accent}-fg}{/bold}` : item.icon,
  );
  nav.setContent(lines.join('\n'));
}

const content = blessed.box({
  parent: layout,
  width: '100%-7',
  height: '100%',
  style: { bg: theme().bg, fg: theme().fg },
});

// Views
const chatList = blessed.box({
  parent: content,
  top: 1,
  left: 1,
  width: '100%-2',
  height: '100%-5',
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  border: { type: 'line' },
  style: { border: { fg: theme().accent } },
});
chatList.setContent(
  "{bold}the 2nd December 10:45 AM{/}\n\n🤖  Hi there, how may I assist you?\n🙂  What's next on my agenda?",
);

const input = blessed.textbox({
  parent: content,
  bottom: 0,
  left: 1,
  width: '100%-2',
  height: 3,
  keys: true,
  inputOnFocus: true,
  border: { type: 'line' },
});

const status = blessed.box({
  parent: content,
  bottom: 3,
  left: 1,
  height: 1,
  width: '100%-2',
  style: { fg: theme().fg },
});

let menuVisible = false;

function defaultStatus() {
  return `View: ${view} • Theme: ${themeKey} • Press Esc for menu`;
}

function menuStatus() {
  return 'Menu: [C] Chat · [T] Todos · [X] Tools · [S] Settings · [Q] Quit · [Esc] Close';
}

function updateStatus() {
  status.setContent(menuVisible ? menuStatus() : defaultStatus());
}

function switchTheme(next: keyof typeof themes) {
  themeKey = next;
  screen.children.forEach(() => {});
  nav.style.bg = theme().panel;
  nav.style.fg = theme().fg;
  content.style.bg = theme().bg;
  content.style.fg = theme().fg;
  chatList.style.border = { fg: theme().accent } as any;
  renderNav(view);
  updateStatus();
  screen.render();
}

let view: 'chat' | 'todos' | 'tools' | 'settings' = 'chat';
function setView(v: typeof view) {
  view = v;
  renderNav(view);
  if (!menuVisible && view === 'chat') {
    input.focus();
  } else {
    status.focus();
  }
  updateStatus();
  screen.render();
}
setView('chat');

function showMenu() {
  if (menuVisible) return;
  menuVisible = true;
  status.focus();
  updateStatus();
  screen.render();
}

function hideMenu() {
  if (!menuVisible) return;
  menuVisible = false;
  if (view === 'chat') input.focus();
  else status.focus();
  updateStatus();
  screen.render();
}

screen.key(['enter'], () => {
  if (menuVisible || view !== 'chat') return;
  const text = input.getValue();
  if (!text) return;
  chatList.setContent(`${chatList.getContent()}\n🙂  ${text}`);
  input.clearValue();
  screen.render();
});

screen.key(['C-c'], () => process.exit(0));
screen.key(['escape'], () => {
  if (menuVisible) hideMenu();
  else showMenu();
});
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
screen.key(['T'], () => switchTheme(themeKey === 'light' ? 'dark' : 'light'));

input.focus();
updateStatus();
screen.render();
