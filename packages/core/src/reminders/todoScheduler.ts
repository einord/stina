import { t } from '@stina/i18n';
import { getChatRepository } from '@stina/chat';
import { getTodoRepository } from '@stina/todos';
import type { RecurringTemplate, RecurringOverlapPolicy, Todo } from '@stina/todos';
import { getTodoSettings, updateTodoSettings } from '@stina/settings';

type SchedulerOptions = {
  intervalMs?: number;
  /**
   * Optional notifier. Defaults to posting info messages via chat repository.
   * Provide a custom notifier (e.g., ChatManager.sendMessage) to trigger assistant replies.
   */
  notify?: (content: string) => Promise<unknown>;
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

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function clampDayOfMonth(day: number | null | undefined, date: Date): number {
  const target = day ?? 1;
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.min(Math.max(target, 1), last);
}

function parseTimeOfDay(hhmm?: string | null): { hours: number; minutes: number } {
  const fallback = { hours: 0, minutes: 0 };
  if (!hhmm) return fallback;
  const match = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return { hours, minutes };
}

// Note: timezones on templates are not yet applied; times are interpreted in local time.
function combineDateTime(base: Date, hhmm?: string | null): number {
  const { hours, minutes } = parseTimeOfDay(hhmm);
  const d = new Date(base);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

function matchesFrequency(date: Date, template: RecurringTemplate): boolean {
  const month = date.getMonth() + 1;
  switch (template.frequency) {
    case 'weekly': {
      const days =
        template.daysOfWeek && template.daysOfWeek.length
          ? template.daysOfWeek
          : typeof template.dayOfWeek === 'number'
            ? [template.dayOfWeek]
            : [date.getDay()];
      return days.includes(date.getDay());
    }
    case 'monthly': {
      const allowedMonths = template.months?.length ? template.months : null;
      if (allowedMonths && !allowedMonths.includes(month)) return false;
      const target = clampDayOfMonth(template.dayOfMonth ?? 1, date);
      return date.getDate() === target;
    }
    case 'yearly': {
      const targetMonth = template.monthOfYear ?? template.months?.[0] ?? 1;
      if (month !== targetMonth) return false;
      const targetDay = clampDayOfMonth(template.dayOfMonth ?? 1, date);
      return date.getDate() === targetDay;
    }
    default:
      return false;
  }
}

function computeUpcomingOccurrences(
  template: RecurringTemplate,
  now: number,
  maxCount: number,
): number[] {
  const occurrences: number[] = [];
  let cursor = startOfDay(new Date(now));
  let safety = 0;
  const safetyLimit = Math.max(maxCount * 450, 450);
  while (occurrences.length < maxCount && safety < safetyLimit) {
    if (matchesFrequency(cursor, template)) {
      occurrences.push(combineDateTime(cursor, template.timeOfDay));
    }
    cursor = addDays(cursor, 1);
    safety += 1;
  }
  return occurrences.sort((a, b) => a - b);
}

async function applyOverlapPolicy(
  policy: RecurringOverlapPolicy,
  openTodos: Todo[],
  repo: ReturnType<typeof getTodoRepository>,
) {
  if (policy === 'skip_if_open' && openTodos.length) return false;
  if (policy === 'replace_open' && openTodos.length) {
    for (const todo of openTodos) {
      await repo.update(todo.id, { status: 'cancelled' });
    }
  }
  return true;
}

async function handleRecurringTemplates(repo: ReturnType<typeof getTodoRepository>, now: number) {
  const templates = await repo.listRecurringTemplates(true);
  for (const template of templates) {
    const leadMinutes = Math.max(template.leadTimeMinutes ?? 0, 0);
    const leadMs = template.leadTimeUnit === 'after_completion' ? 0 : leadMinutes * 60_000;
    const requireCompletion = template.leadTimeUnit === 'after_completion';
    const occurrences = computeUpcomingOccurrences(template, now, requireCompletion ? 1 : 6);
    let latestGenerated: number | null = null;
    for (const dueAt of occurrences) {
      if (template.lastGeneratedDueAt && template.lastGeneratedDueAt >= dueAt) continue;
      if (!requireCompletion && now < dueAt - leadMs) continue;
      const openTodos = await repo.listOpenTodosForTemplate(template.id);
      if (requireCompletion && openTodos.length) continue;
      const shouldCreate = await applyOverlapPolicy(template.overlapPolicy ?? 'skip_if_open', openTodos, repo);
      if (!shouldCreate) continue;
      const created = await repo.insert({
        title: template.title,
        description: template.description ?? undefined,
        status: 'not_started',
        dueAt,
        isAllDay: template.isAllDay ?? false,
        reminderMinutes: template.reminderMinutes ?? null,
        projectId: template.projectId ?? undefined,
        recurringTemplateId: template.id,
        source: 'recurring_template',
      });
      if (created) {
        latestGenerated = Math.max(latestGenerated ?? -Infinity, dueAt);
      }
    }
    if (latestGenerated !== null) {
      const updated = await repo.updateRecurringTemplate(template.id, { lastGeneratedDueAt: latestGenerated });
      if (updated) template.lastGeneratedDueAt = updated.lastGeneratedDueAt ?? template.lastGeneratedDueAt;
    }
  }
}

/**
 * Starts a polling scheduler that posts automation/info messages ahead of todo timepoints
 * and daily summaries for all-day todos. Returns a disposer to stop the loop.
 */
export function startTodoReminderScheduler(options: SchedulerOptions = {}) {
  const repo = getTodoRepository();
  const chatRepo = getChatRepository();
  const intervalMs = options.intervalMs ?? 60_000;
  const notify = options.notify ?? ((content: string) => chatRepo.appendInfoMessage(content));
  const firedReminders = new Set<string>();
  let lastCleanupDate: string | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const settings = await getTodoSettings();
      const defaultReminder = settings?.defaultReminderMinutes ?? null;
      const allDayTime = settings?.allDayReminderTime || '09:00';
      const lastAllDayReminderAt = settings?.lastAllDayReminderAt ?? null;
      const nowForRecurring = Date.now();
      await handleRecurringTemplates(repo, nowForRecurring);
      const now = Date.now();
      const todos = await repo.list();
      const activeTodos = todos.filter(
        (todo) => todo.status !== 'completed' && todo.status !== 'cancelled',
      );

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
        notify,
      );
      const nextAllDayReminderAt = await handleAllDaySummary(
        activeTodos,
        allDayTime,
        now,
        lastAllDayReminderAt,
        notify,
      );
      if (nextAllDayReminderAt !== lastAllDayReminderAt) {
        await updateTodoSettings({ lastAllDayReminderAt: nextAllDayReminderAt });
      }
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
        ? t('reminders.timepoint_now', { title: todo.title, id: todo.id })
        : t('reminders.timepoint_minutes', {
            minutes: String(reminderMinutes),
            title: todo.title,
            id: todo.id,
          });
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
  lastReminderAt: number | null,
  send: (content: string) => Promise<unknown>,
): Promise<number | null> {
  const today = new Date(now);
  const todayKey = toLocalDateKey(today);
  const reminderTs = getLocalTime(today, allDayTime);
  if (reminderTs === null || now < reminderTs) return lastReminderAt;
  if (
    lastReminderAt !== null &&
    toLocalDateKey(new Date(lastReminderAt)) === todayKey
  ) return lastReminderAt;

  const todaysAllDay = todos.filter((todo) => {
    if (!todo.isAllDay || !todo.dueAt) return false;
    const dateKey = toLocalDateKey(new Date(todo.dueAt));
    return dateKey === todayKey;
  });
  if (!todaysAllDay.length) return lastReminderAt;

  const list = todaysAllDay
    .map((todo) => `- ${todo.title}${todo.projectName ? ` (${todo.projectName})` : ''} [${todo.id}]`)
    .join('\n');
  const content = t('reminders.all_day_summary', { list });
  await send(content);
  return Date.now();
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
