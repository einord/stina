import blessed from 'blessed';

import type { Theme } from './theme.js';

export interface UILayout {
  layout: blessed.Widgets.LayoutElement;
  content: blessed.Widgets.BoxElement;
  main: blessed.Widgets.BoxElement;
  input: blessed.Widgets.TextboxElement;
  status: blessed.Widgets.BoxElement;
  todos: blessed.Widgets.BoxElement;
  applyTheme(theme: Theme): void;
  setTodosVisible(visible: boolean): void;
}

export function createLayout(
  screen: blessed.Widgets.Screen,
  theme: Theme,
): UILayout {
  type ScrollableBox = blessed.Widgets.BoxElement & {
    scrollbar?: blessed.Widgets.BoxOptions['scrollbar'];
  };

  const TODO_PANEL_WIDTH = 30;

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

  const main = blessed.box({
    parent: content,
    top: 1,
    left: 1,
    width: '100%-2',
    height: '100%-5',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    scrollbar: {
      style: { bg: theme.accent },
    },
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

  const todos = blessed.box({
    parent: layout,
    width: 0,
    height: '100%',
    tags: true,
    hidden: true,
    border: { type: 'line' },
    style: { bg: theme.bg, fg: theme.fg, border: { fg: theme.accent } },
  });

  return {
    layout,
    content,
    main,
    input,
    status,
    todos,
    applyTheme(next) {
      content.style.bg = next.bg;
      content.style.fg = next.fg;
      const borderColor = next.accent as unknown as number;
      const borderStyle: blessed.Widgets.Border = { fg: borderColor };
      main.style.border = borderStyle;
      const scrollableMain = main as ScrollableBox;
      scrollableMain.scrollbar = { style: { bg: next.accent } };
      todos.style.bg = next.bg;
      todos.style.fg = next.fg;
      const todoBorder: blessed.Widgets.Border = { fg: borderColor };
      todos.style.border = todoBorder;
      status.style.fg = next.fg;
    },
    setTodosVisible(visible) {
      if (visible) {
        todos.show();
        todos.width = TODO_PANEL_WIDTH;
        content.width = `100%-${TODO_PANEL_WIDTH}`;
      } else {
        todos.hide();
        todos.width = 0;
        content.width = '100%';
      }
    },
  };
}
