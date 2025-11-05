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

nav.setContent(navItems.map(i => `${i.icon}`).join('\n'));

const content = blessed.box({
  parent: layout,
  width: '100%-7',
  height: '100%',
  style: { bg: theme().bg, fg: theme().fg },
});

// Views
const chatList = blessed.box({ parent: content, top: 1, left: 1, width: '100%-2', height: '100%-5', tags: true, scrollable: true, alwaysScroll: true, border: { type: 'line' }, style: { border: { fg: theme().accent } } });
chatList.setContent('{bold}the 2nd December 10:45 AM{/}\n\n🤖  Hi there, how may I assist you?\n🙂  What\'s next on my agenda?');

const input = blessed.textbox({ parent: content, bottom: 0, left: 1, width: '100%-2', height: 3, keys: true, inputOnFocus: true, border: { type: 'line' } });

const status = blessed.box({ parent: content, bottom: 3, left: 1, height: 1, width: '100%-2', content: 'Press c/t/x/s to switch views • Enter to send • ? for help', style: { fg: theme().fg } });

function switchTheme(next: keyof typeof themes) {
  themeKey = next;
  screen.children.forEach(() => {});
  nav.style.bg = theme().panel; nav.style.fg = theme().fg;
  content.style.bg = theme().bg; content.style.fg = theme().fg;
  chatList.style.border = { fg: theme().accent } as any;
  screen.render();
}

let view: 'chat'|'todos'|'tools'|'settings' = 'chat';
function setView(v: typeof view) {
  view = v;
  status.setContent(`View: ${v} • Press c/t/x/s to switch • Theme: ${themeKey} • Press T to toggle theme`);
  screen.render();
}
setView('chat');

screen.key(['enter'], () => {
  if (view !== 'chat') return;
  const text = input.getValue();
  if (!text) return;
  chatList.setContent(`${chatList.getContent()}\n🙂  ${text}`);
  input.clearValue();
  screen.render();
});

screen.key(['C-c','q','escape'], () => process.exit(0));
screen.key(['c'], () => setView('chat'));
screen.key(['t'], () => setView('todos'));
screen.key(['x'], () => setView('tools'));
screen.key(['s'], () => setView('settings'));
screen.key(['T'], () => switchTheme(themeKey === 'light' ? 'dark' : 'light'));

input.focus();
screen.render();
