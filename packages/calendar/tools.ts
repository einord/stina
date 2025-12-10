import { t } from '@stina/i18n';
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
      description: 'Lists upcoming events for configured calendars.',
      parameters: {
        type: 'object',
        properties: {
          calendar_id: { type: 'string', description: 'Optional calendar id to filter' },
          range_ms: {
            type: 'number',
            description: 'Optional range forward from now (ms) to include events',
          },
        },
      },
    },
    handler: async (args) => {
      const repo = getCalendarRepository();
      const now = Date.now();
      const input = args as { calendar_id?: string; range_ms?: number };
      const rangeMs = typeof input.range_ms === 'number' && Number.isFinite(input.range_ms)
        ? Math.max(0, input.range_ms)
        : DEFAULT_RANGE_MS;
      const events = await repo.listEvents(input.calendar_id ? String(input.calendar_id) : undefined, {
        start: now,
        end: now + rangeMs,
      });
      return events.map((ev) => ({
        id: ev.id,
        calendar_id: ev.calendarId,
        title: ev.title,
        description: ev.description ?? null,
        location: ev.location ?? null,
        start_ts: ev.startTs,
        end_ts: ev.endTs,
        all_day: ev.allDay,
        reminder_minutes: ev.reminderMinutes ?? null,
      }));
    },
  },
];
