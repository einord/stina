import { t } from '@stina/i18n';
import { getChatRepository } from '@stina/chat';
import { getTodoRepository } from '@stina/todos';
import type { Todo } from '@stina/todos';
import { getTodoSettings } from '@stina/settings';

type SchedulerOptions = {
  intervalMs?: number;
};

/**
 * Helper to format a Date as a local YYYY-MM-DD key (not UTC).
 */
function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
  let lastCleanupDate: string | null = null;
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

      // Clean up old fired reminders once per day
      const todayKey = toLocalDateKey(new Date(now));
      if (lastCleanupDate !== todayKey) {
        cleanupOldReminders(firedReminders, now);
        lastCleanupDate = todayKey;
      }

      await handleTimepointReminders(
        activeTodos,
        defaultReminder,
        now,
        firedReminders,
        async (content) => chatRepo.appendInfoMessage(content),
      );
      lastAllDaySummaryDate = await handleAllDaySummary(
        activeTodos,
        allDayTime,
        now,
        lastAllDaySummaryDate,
        async (content) => chatRepo.appendInfoMessage(content),
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

/**
 * Removes old reminder keys that are past their due date by more than 24 hours.
 */
function cleanupOldReminders(firedReminders: Set<string>, now: number) {
  const cutoff = now - 24 * 60 * 60 * 1000; // 24 hours ago
  for (const key of firedReminders) {
    const parts = key.split(':');
    if (parts.length >= 2) {
      const dueAt = Number(parts[1]);
      // Only delete if dueAt is a valid number and is older than cutoff
      if (Number.isFinite(dueAt) && dueAt < cutoff) {
        firedReminders.delete(key);
      }
    }
  }
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
    // For immediate reminders (0 minutes), fire once the todo is due or overdue
    // The firedReminders Set prevents duplicate notifications
    if (reminderMinutes === 0) {
      if (now < todo.dueAt) continue;
    } else {
      // For advance reminders, fire in the window before due
      if (now < reminderAt || now >= todo.dueAt) continue;
    }
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

/**
 * Handles the daily all-day todo summary. Returns the updated lastSummaryDate.
 */
async function handleAllDaySummary(
  todos: Todo[],
  allDayTime: string,
  now: number,
  lastSummaryDate: string | null,
  send: (content: string) => Promise<unknown>,
): Promise<string | null> {
  const today = new Date(now);
  const todayKey = toLocalDateKey(today);
  if (lastSummaryDate === todayKey) return lastSummaryDate;
  const reminderTs = getLocalTime(today, allDayTime);
  if (reminderTs === null || now < reminderTs) return lastSummaryDate;

  const todaysAllDay = todos.filter((todo) => {
    if (!todo.isAllDay || !todo.dueAt) return false;
    const dateKey = toLocalDateKey(new Date(todo.dueAt));
    return dateKey === todayKey;
  });
  // Mark as processed even when no todos to avoid repeated checks
  if (!todaysAllDay.length) return todayKey;

  const list = todaysAllDay
    .map((todo) => `- ${todo.title}${todo.projectName ? ` (${todo.projectName})` : ''}`)
    .join('\n');
  const content = t('reminders.all_day_summary', { list });
  await send(content);
  return todayKey;
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
