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
  calendarVisible: boolean,
  warning?: string | null,
): string {
  if (menuVisible) {
    return t('tui.menu');
  }
  const viewLabel =
    view === 'chat' ? t('tui.nav_chat') : view === 'tools' ? t('tui.nav_tools') : t('tui.nav_settings');
  const todosLabel = todosVisible ? t('tui.todos_on') : t('tui.todos_off');
  const calendarLabel = calendarVisible ? t('tui.calendar_on') : t('tui.calendar_off');
  const warningLabel = warning ? `⚠ ${warning} • ` : '';
  return `${warningLabel}${t('tui.view_label')}: ${viewLabel} • ${todosLabel} • ${calendarLabel} • Theme: ${themeKey} • ${t('tui.press_esc')}`;
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
  calendarVisible: boolean,
  warning?: string | null,
): void {
  statusBox.setContent(statusText(view, themeKey, menuVisible, todosVisible, calendarVisible, warning));
}
