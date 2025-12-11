import { getCalendarRepository } from '@stina/calendar';
import { getChatRepository } from '@stina/chat';
import { t } from '@stina/i18n';

const DEFAULT_REMINDER_MINUTES = 10;

type SchedulerOptions = {
  intervalMs?: number;
  notify?: (content: string) => Promise<unknown>;
};

export function startCalendarReminderScheduler(options: SchedulerOptions = {}) {
  const repo = getCalendarRepository();
  const chatRepo = getChatRepository();
  const intervalMs = options.intervalMs ?? 5 * 60_000;
  const notify = options.notify ?? ((content: string) => chatRepo.appendInfoMessage(content));
  const fired = new Set<string>();
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      await repo.syncAllEnabled();
      const now = Date.now();
      const events = await repo.listEvents(undefined, {
        start: now,
        end: now + 48 * 60 * 60 * 1000,
      });
      for (const ev of events) {
        const remindMs = (ev.reminderMinutes ?? DEFAULT_REMINDER_MINUTES) * 60_000;
        const key = `${ev.id}:${remindMs}`;
        if (fired.has(key)) continue;
        if (now >= ev.startTs - remindMs && now <= ev.startTs) {
          fired.add(key);
          const start = new Date(ev.startTs);
          const formatted = `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          const content = t('calendar.reminder', {
            title: ev.title,
            date: formatted,
            description: ev.description || '',
          });
          await notify(content);
        }
      }
    } catch (err) {
      console.warn('[calendar] scheduler tick failed', err);
    }
    if (!stopped) setTimeout(tick, intervalMs);
  };

  setTimeout(tick, 0);
  return () => {
    stopped = true;
  };
}
