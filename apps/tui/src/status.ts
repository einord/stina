import blessed from 'blessed';

import type { ThemeKey } from './theme.js';

export type ViewKey = 'chat' | 'todos' | 'tools' | 'settings';

export function statusText(view: ViewKey, themeKey: ThemeKey, menuVisible: boolean): string {
  if (menuVisible) {
    return 'Menu: [C] Chat · [T] Todos · [X] Tools · [S] Settings · [Q] Quit · [Esc] Close';
  }
  return `View: ${view} • Theme: ${themeKey} • Press Esc for menu`;
}

export function updateStatus(
  statusBox: blessed.Widgets.BoxElement,
  view: ViewKey,
  themeKey: ThemeKey,
  menuVisible: boolean,
): void {
  statusBox.setContent(statusText(view, themeKey, menuVisible));
}
