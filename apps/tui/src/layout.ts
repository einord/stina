import blessed from 'blessed';

import type { Theme } from './theme.js';

export interface UILayout {
  layout: blessed.Widgets.LayoutElement;
  nav: blessed.Widgets.ListElement;
  content: blessed.Widgets.BoxElement;
  main: blessed.Widgets.BoxElement;
  input: blessed.Widgets.TextboxElement;
  status: blessed.Widgets.BoxElement;
  rightPanel: blessed.Widgets.BoxElement;
  todos: blessed.Widgets.BoxElement;
  calendar: blessed.Widgets.BoxElement;
  applyTheme(theme: Theme): void;
  setTodosVisible(visible: boolean): void;
  setCalendarVisible(visible: boolean): void;
  setView(view: string): void;
}

/**
 * Builds the Blessed layout for the TUI client, wiring up panes and styling hooks.
 * @param screen Root Blessed screen.
 * @param theme Initial theme colors to apply.
 */
export function createLayout(screen: blessed.Widgets.Screen, theme: Theme): UILayout {
  type ScrollableBox = blessed.Widgets.BoxElement & {
    scrollbar?: blessed.Widgets.BoxOptions['scrollbar'];
  };

  const NAV_WIDTH = 18;
  const RIGHT_PANEL_WIDTH = 32;

  const layout = blessed.box({
    parent: screen,
    width: '100%',
    height: '100%',
  });

  const nav = blessed.list({
    parent: layout,
    width: NAV_WIDTH,
    height: '100%',
    keys: true,
    mouse: true,
    tags: true,
    border: { type: 'line' },
    style: {
      bg: theme.bg,
      fg: theme.fg,
      selected: { bg: theme.accent, fg: theme.bg },
      border: { fg: theme.accent },
    },
    items: [],
    vi: true,
    search: true,
  });

  const content = blessed.box({
    parent: layout,
    left: NAV_WIDTH,
    width: `100%-${NAV_WIDTH}`,
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
    style: { fg: theme.accent, bg: theme.panel },
  });

  const rightPanel = blessed.box({
    parent: layout,
    left: '100%-' + RIGHT_PANEL_WIDTH,
    width: 0,
    height: '100%',
    hidden: true,
    border: { type: 'line' },
    style: { bg: theme.bg, fg: theme.fg, border: { fg: theme.accent } },
  });

  const todos = blessed.box({
    parent: rightPanel,
    top: 0,
    height: '50%',
    width: '100%',
    tags: true,
    hidden: true,
    border: { type: 'line' },
    style: { bg: theme.bg, fg: theme.fg, border: { fg: theme.accent } },
  });

  const calendar = blessed.box({
    parent: rightPanel,
    top: '50%',
    height: '50%',
    width: '100%',
    tags: true,
    hidden: true,
    border: { type: 'line' },
    style: { bg: theme.bg, fg: theme.fg, border: { fg: theme.accent } },
  });

  function applyPanelLayout(todosVisible: boolean, calendarVisible: boolean) {
    const visibleCount = Number(todosVisible) + Number(calendarVisible);
    if (!visibleCount) {
      todos.hide();
      calendar.hide();
      rightPanel.hide();
      rightPanel.width = 0;
      content.width = `100%-${NAV_WIDTH}`;
      content.left = NAV_WIDTH;
      return;
    }

    rightPanel.show();
    rightPanel.width = RIGHT_PANEL_WIDTH;
    content.width = `100%-${NAV_WIDTH + RIGHT_PANEL_WIDTH}`;
    content.left = NAV_WIDTH;

    const singleHeight = '100%';
    const splitHeight = '50%-1';

    if (todosVisible && calendarVisible) {
      todos.top = 0;
      todos.height = splitHeight;
      calendar.top = '50%';
      calendar.height = splitHeight;
      todos.show();
      calendar.show();
    } else if (todosVisible) {
      todos.top = 0;
      todos.height = singleHeight;
      todos.show();
      calendar.hide();
    } else if (calendarVisible) {
      calendar.top = 0;
      calendar.height = singleHeight;
      calendar.show();
      todos.hide();
    }
  }

  return {
    layout,
    nav,
    content,
    main,
    input,
    status,
    rightPanel,
    todos,
    calendar,
    /**
     * Applies a new theme palette to all layout components.
     */
    applyTheme(next) {
      content.style.bg = next.bg;
      content.style.fg = next.fg;
      const borderColor = next.accent as unknown as number;
      const borderStyle: blessed.Widgets.Border = { fg: borderColor };
      main.style.border = borderStyle;
      const scrollableMain = main as ScrollableBox;
      scrollableMain.scrollbar = { style: { bg: next.accent } };
      nav.style.bg = next.bg;
      nav.style.fg = next.fg;
      nav.style.border = borderStyle;
      nav.style.selected = { bg: next.accent, fg: next.bg };
      rightPanel.style.bg = next.bg;
      rightPanel.style.fg = next.fg;
      rightPanel.style.border = borderStyle;
      todos.style.bg = next.bg;
      todos.style.fg = next.fg;
      const todoBorder: blessed.Widgets.Border = { fg: borderColor };
      todos.style.border = todoBorder;
      calendar.style.bg = next.bg;
      calendar.style.fg = next.fg;
      calendar.style.border = todoBorder;
      status.style.fg = next.accent;
      status.style.bg = next.panel;
    },
    /**
     * Shows or hides the todo side panel while adjusting the main width.
     */
    setTodosVisible(visible) {
      applyPanelLayout(visible, !calendar.hidden);
    },
    /**
     * Shows or hides the calendar panel and recalculates layout.
     */
    setCalendarVisible(visible) {
      applyPanelLayout(!todos.hidden, visible);
    },
    /**
     * Updates selected navigation item.
     */
    setView(view: string) {
      const keys = (nav as unknown as { viewKeys?: string[] }).viewKeys;
      const idx = keys?.indexOf(view);
      if (typeof idx === 'number' && idx >= 0) nav.select(idx);
    },
  };
}
