import { t } from '@stina/i18n';
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
    return t('tui.menu');
  }
  const todosLabel = todosVisible ? t('tui.todos_on') : t('tui.todos_off');
  const warningLabel = warning ? `⚠ ${warning} • ` : '';
  return `${warningLabel}${t('tui.view_label')}: ${view} • ${todosLabel} • Theme: ${themeKey} • ${t('tui.press_esc')}`;
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
