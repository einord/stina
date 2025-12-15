import { t } from '@stina/i18n';

import { renderCalendarPane, renderTodosPane } from './render.js';
import type { UILayout } from './layout.js';

type TodoRepo = ReturnType<typeof import('@stina/work')['getTodoRepository']>;
type CalendarRepo = ReturnType<typeof import('@stina/calendar')['getCalendarRepository']>;

export async function loadTodos(repo: TodoRepo, layout: UILayout) {
  try {
    const list = await repo.list({ includeArchived: false, limit: 50 });
    renderTodosPane(list, layout);
  } catch (err) {
    layout.todos.setContent(t('tui.todos_error'));
    void err;
  }
}

export function subscribeTodos(repo: TodoRepo, loader: () => void) {
  return repo.onChange(() => void loader());
}

export async function loadCalendar(repo: CalendarRepo, layout: UILayout) {
  try {
    const now = Date.now();
    const rangeMs = 7 * 24 * 60 * 60 * 1000;
    const events = await repo.listEventsRange({ start: now, end: now + rangeMs });
    renderCalendarPane(events, layout);
  } catch (err) {
    layout.calendar.setContent(t('tui.calendar_error'));
    void err;
  }
}

export function subscribeCalendar(repo: CalendarRepo, loader: () => void) {
  return repo.onChange(() => void loader());
}
