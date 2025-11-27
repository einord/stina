import { t } from '@stina/i18n';
import { getChatRepository } from '@stina/chat';
import { getTodoRepository } from '@stina/todos';
import type { Todo } from '@stina/todos';
import { getTodoSettings } from '@stina/settings';

type SchedulerOptions = {
  intervalMs?: number;
};

/**
 * Starts a polling scheduler that posts automation/info messages ahead of todo timepoints
 * and daily summaries for all-day todos. Returns a disposer to stop the loop.
 */
export function startTodoReminderScheduler(options: SchedulerOptions = {}) {
  const repo = getTodoRepository();
  const chatRepo = getChatRepository();
  const intervalMs = options.intervalMs ?? 60_000;
  const firedReminders = new Set<string>();
  let lastAllDaySummaryDate: string | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const settings = await getTodoSettings();
      const defaultReminder = settings?.defaultReminderMinutes ?? null;
      const allDayTime = settings?.allDayReminderTime || '09:00';
      const todos = await repo.list();
      const activeTodos = todos.filter(
        (todo) => todo.status !== 'completed' && todo.status !== 'cancelled',
      );
      const now = Date.now();

      await handleTimepointReminders(
        activeTodos,
        defaultReminder,
        now,
        firedReminders,
        async (content) => chatRepo.appendInfoMessage(content),
      );
      await handleAllDaySummary(
        activeTodos,
        allDayTime,
        now,
        lastAllDaySummaryDate,
        async (content, nextDate) => {
          await chatRepo.appendInfoMessage(content);
          lastAllDaySummaryDate = nextDate;
        },
      );
    } catch (err) {
      console.error('[reminders] scheduler tick failed', err);
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function handleTimepointReminders(
  todos: Todo[],
  defaultReminder: number | null,
  now: number,
  firedReminders: Set<string>,
  send: (content: string) => Promise<unknown>,
) {
  for (const todo of todos) {
    if (todo.isAllDay || !todo.dueAt) continue;
    const reminderMinutes =
      todo.reminderMinutes !== null && todo.reminderMinutes !== undefined
        ? todo.reminderMinutes
        : defaultReminder;
    if (reminderMinutes === null || reminderMinutes === undefined) continue;
    const reminderAt = todo.dueAt - reminderMinutes * 60_000;
    if (now < reminderAt || now >= todo.dueAt) continue;
    const key = `${todo.id}:${todo.dueAt}:${reminderMinutes}`;
    if (firedReminders.has(key)) continue;
    firedReminders.add(key);
    const content =
      reminderMinutes === 0
        ? t('reminders.timepoint_now', { title: todo.title })
        : t('reminders.timepoint_minutes', { minutes: String(reminderMinutes), title: todo.title });
    await send(content);
  }
}

async function handleAllDaySummary(
  todos: Todo[],
  allDayTime: string,
  now: number,
  lastSummaryDate: string | null,
  send: (content: string, nextDate: string) => Promise<unknown>,
) {
  const today = new Date(now);
  const todayKey = today.toISOString().slice(0, 10);
  if (lastSummaryDate === todayKey) return;
  const reminderTs = getLocalTime(today, allDayTime);
  if (reminderTs === null || now < reminderTs) return;

  const todaysAllDay = todos.filter((todo) => {
    if (!todo.isAllDay || !todo.dueAt) return false;
    const dateKey = new Date(todo.dueAt).toISOString().slice(0, 10);
    return dateKey === todayKey;
  });
  if (!todaysAllDay.length) return;

  const list = todaysAllDay
    .map((todo) => `- ${todo.title}${todo.projectName ? ` (${todo.projectName})` : ''}`)
    .join('\n');
  const content = t('reminders.all_day_summary', { list });
  await send(content, todayKey);
}

function getLocalTime(base: Date, hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, hh, mm] = match;
  const date = new Date(base);
  date.setHours(Number(hh), Number(mm), 0, 0);
  return date.getTime();
}
