import blessed from 'blessed';

import type { ThemeKey } from './theme.js';

export type ViewKey = 'chat' | 'tools' | 'settings';

/**
 * Generates the status line string shown at the bottom of the TUI.
 */
export function statusText(
  view: ViewKey,
  themeKey: ThemeKey,
  menuVisible: boolean,
  todosVisible: boolean,
  warning?: string | null,
): string {
  if (menuVisible) {
    return 'Menu: [C] Chat · [X] Tools · [S] Settings · [T] Toggle Todos · [Q] Quit · [Esc] Close';
  }
  const todosLabel = todosVisible ? 'Todos: on' : 'Todos: off';
  const warningLabel = warning ? `⚠ ${warning} • ` : '';
  return `${warningLabel}View: ${view} • ${todosLabel} • Theme: ${themeKey} • Press Esc for menu`;
}

/**
 * Writes the latest status text into the Blessed box.
 */
export function updateStatus(
  statusBox: blessed.Widgets.BoxElement,
  view: ViewKey,
  themeKey: ThemeKey,
  menuVisible: boolean,
  todosVisible: boolean,
  warning?: string | null,
): void {
  statusBox.setContent(statusText(view, themeKey, menuVisible, todosVisible, warning));
}
