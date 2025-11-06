import blessed from 'blessed';

import type { Theme } from './theme.js';

export interface UILayout {
  layout: blessed.Widgets.LayoutElement;
  content: blessed.Widgets.BoxElement;
  chatList: blessed.Widgets.BoxElement;
  input: blessed.Widgets.TextboxElement;
  status: blessed.Widgets.BoxElement;
  applyTheme(theme: Theme): void;
}

export function createLayout(
  screen: blessed.Widgets.Screen,
  theme: Theme,
): UILayout {
  const layout = blessed.layout({
    parent: screen,
    width: '100%',
    height: '100%',
    layout: 'inline',
  });

  const content = blessed.box({
    parent: layout,
    width: '100%',
    height: '100%',
    style: { bg: theme.bg, fg: theme.fg },
  });

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
    style: { border: { fg: theme.accent } },
  });

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
    style: { fg: theme.fg },
  });

  return {
    layout,
    content,
    chatList,
    input,
    status,
    applyTheme(next) {
      content.style.bg = next.bg;
      content.style.fg = next.fg;
      chatList.style.border = { fg: next.accent } as any;
      status.style.fg = next.fg;
    },
  };
}
