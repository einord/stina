import { t } from '@stina/i18n';
import dayjs from 'dayjs';
import type { CalendarEvent } from './types.js';
import type { ToolDefinition } from '@stina/core';

import { getCalendarRepository } from './index.js';

const DEFAULT_RANGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export const calendarTools: ToolDefinition[] = [
  {
    spec: {
      name: 'calendar_add_ics',
      description: 'Registers a read-only ICS calendar by URL so Stina can read events.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name for the calendar' },
          url: { type: 'string', description: 'Public ICS/ical URL' },
        },
        required: ['name', 'url'],
      },
    },
    handler: async (args) => {
      const input = args as { name?: string; url?: string };
      const repo = getCalendarRepository();
      const calendar = await repo.upsertCalendar({
        name: String(input.name || '').trim(),
        url: String(input.url || '').trim(),
      });
      return {
        message: t('calendar.tool_added'),
        calendar: {
          id: calendar.id,
          name: calendar.name,
          url: calendar.url,
          enabled: calendar.enabled,
        },
      };
    },
  },
  {
    spec: {
      name: 'calendar_list',
      description: 'Lists configured calendars.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    handler: async () => {
      const repo = getCalendarRepository();
      const calendars = await repo.listCalendars();
      return calendars.map((c) => ({
        id: c.id,
        name: c.name,
        url: c.url,
        enabled: c.enabled,
        last_synced_at: c.lastSyncedAt ?? null,
      }));
    },
  },
  {
    spec: {
      name: 'calendar_events',
      description: 'Lists upcoming events for all configured calendars.',
      parameters: {
        type: 'object',
        properties: {
          range_ms: {
            type: 'number',
            description: 'Optional range forward from now (ms) to include events',
          },
          lookback_ms: {
            type: 'number',
            description: 'Optional range backward from now (ms) to include past events',
          },
        },
      },
    },
    handler: async (args) => {
      const repo = getCalendarRepository();
      await repo.syncAllEnabled();
      const now = Date.now();
      const input = args as { range_ms?: number; lookback_ms?: number };
      const rangeMs = typeof input.range_ms === 'number' && Number.isFinite(input.range_ms)
        ? Math.max(0, input.range_ms)
        : DEFAULT_RANGE_MS;
      const lookback = typeof input.lookback_ms === 'number' && Number.isFinite(input.lookback_ms)
        ? Math.max(0, input.lookback_ms)
        : 0;
      const events = await repo.listEvents(undefined, {
        start: now - lookback,
        end: now + rangeMs,
      });
      const calendars = await repo.listCalendars();
      const normalizeEvent = (ev: CalendarEvent): CalendarEvent => {
        if (!ev.allDay) return ev;
        const startDay = dayjs(ev.startTs).startOf('day').valueOf();
        const endDay = dayjs(ev.endTs).subtract(1, 'millisecond').endOf('day').valueOf();
        return {
          ...ev,
          startTs: startDay,
          endTs: Math.max(startDay, endDay),
        };
      };
      const formatLocal = (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm');

      return events
        .map((ev) => normalizeEvent(ev))
        .filter((ev) => ev.endTs >= now)
        .map((ev) => ({
          id: ev.id,
          calendar_id: ev.calendarId,
          calendar_name: calendars.find((c) => c.id === ev.calendarId)?.name ?? null,
          title: ev.title,
          description: ev.description ?? null,
          location: ev.location ?? null,
          start_ts: ev.startTs,
          end_ts: ev.endTs,
          start_local: formatLocal(ev.startTs),
          end_local: formatLocal(ev.endTs),
          all_day: ev.allDay,
          reminder_minutes: ev.reminderMinutes ?? null,
        }));
    },
  },
];
