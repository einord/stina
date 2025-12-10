import crypto from 'node:crypto';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import ical from 'node-ical';

import store from '@stina/store';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import { calendarTables, calendarsTable, calendarEventsTable } from './schema.js';
import type { Calendar, CalendarEvent } from './types.js';

const MODULE = 'calendar';

function uid(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function safeHash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

class CalendarRepository {
  constructor(
    // Drizzle typings across packages can diverge; keep db loosely typed to avoid version clashes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: any,
    private readonly emitChange: (payload: { kind: 'calendar' | 'events'; id?: string }) => void,
  ) {}

  async listCalendars(): Promise<Calendar[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const rows = await db.select().from(calendarsTable).orderBy(asc(calendarsTable.createdAt));
    return rows as Calendar[];
  }

  async upsertCalendar(payload: { name: string; url: string; color?: string | null; enabled?: boolean }): Promise<Calendar> {
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const existing = await db
      .select()
      .from(calendarsTable)
      .where(eq(calendarsTable.url, payload.url))
      .limit(1);
    if (existing[0]) {
      const updated = (await db
        .update(calendarsTable)
        .set({
          name: payload.name || existing[0].name,
          color: payload.color ?? existing[0].color,
          enabled: payload.enabled ?? existing[0].enabled,
          updatedAt: now,
        })
        .where(eq(calendarsTable.id, existing[0].id))
        .returning()) as Calendar[];
      this.emitChange({ kind: 'calendar', id: existing[0].id });
      return updated[0];
    }

    const [created] = (await db
      .insert(calendarsTable)
      .values({
        id: uid('cal'),
        name: payload.name.trim() || payload.url,
        url: payload.url.trim(),
        color: payload.color ?? null,
        enabled: payload.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()) as Calendar[];
    this.emitChange({ kind: 'calendar', id: created.id });
    return created;
  }

  async removeCalendar(id: string): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const result = (await db.delete(calendarsTable).where(eq(calendarsTable.id, id))) as {
      rowsAffected?: number;
      changes?: number;
    };
    this.emitChange({ kind: 'calendar', id });
    return Number(result?.rowsAffected ?? result?.changes ?? 0) > 0;
  }

  async setEnabled(id: string, enabled: boolean): Promise<Calendar | null> {
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const updated = (await db
      .update(calendarsTable)
      .set({ enabled, updatedAt: now })
      .where(eq(calendarsTable.id, id))
      .returning()) as Calendar[];
    if (updated[0]) this.emitChange({ kind: 'calendar', id });
    return updated[0] ?? null;
  }

  async listEvents(calendarId?: string, range?: { start?: number; end?: number }): Promise<CalendarEvent[]> {
    const clauses: Array<ReturnType<typeof eq> | ReturnType<typeof gte> | ReturnType<typeof lte>> = [];
    if (calendarId) clauses.push(eq(calendarEventsTable.calendarId, calendarId));
    if (range?.start != null) clauses.push(gte(calendarEventsTable.startTs, range.start));
    if (range?.end != null) clauses.push(lte(calendarEventsTable.startTs, range.end));

    const where = clauses.length ? and(...clauses) : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const rows = await db
      .select()
      .from(calendarEventsTable)
      .where(where)
      .orderBy(asc(calendarEventsTable.startTs));
    return rows as CalendarEvent[];
  }

  async syncCalendar(calendar: Calendar): Promise<{ inserted: number; skipped: number }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = this.db as any;
    const raw = await ical.async.fromURL(calendar.url);
    const now = Date.now();
    const parsedEvents = Object.values(raw).filter((item) => item?.type === 'VEVENT') as ICalEventWithMeta[];
    const digest = safeHash(JSON.stringify(parsedEvents.map((e) => ({ uid: e.uid, dtstart: e.start, dtend: e.end, updated: e.lastmodified }))));
    if (digest === calendar.lastHash) {
      return { inserted: 0, skipped: parsedEvents.length };
    }

    // Replace events for this calendar
    await db.delete(calendarEventsTable).where(eq(calendarEventsTable.calendarId, calendar.id));

    let inserted = 0;
    for (const event of parsedEvents) {
      if (!event.start || !event.end) continue;
      const allDay = Boolean(event.datetype === 'date' || hasDateOnlyFlag(event.start) || hasDateOnlyFlag(event.end));
      const startTs = event.start.valueOf();
      const endTs = event.end.valueOf();
      const reminderMinutes = Array.isArray(event.alarms) && event.alarms.length
        ? extractReminderMinutes(event.alarms)
        : null;
      const recurrenceId = event.recurrenceid ? String(event.recurrenceid) : null;
      await db.insert(calendarEventsTable).values({
        id: uid('cev'),
        calendarId: calendar.id,
        uid: String(event.uid || uid('uid')),
        recurrenceId,
        title: event.summary || 'Event',
        description: event.description || null,
        location: event.location || null,
        startTs,
        endTs,
        allDay,
        reminderMinutes,
        lastModified: event.lastmodified ? new Date(event.lastmodified).valueOf() : null,
        createdAt: now,
        updatedAt: now,
      });
      inserted += 1;
    }

    await db
      .update(calendarsTable)
      .set({ lastSyncedAt: now, lastHash: digest, updatedAt: now })
      .where(eq(calendarsTable.id, calendar.id));
    this.emitChange({ kind: 'events', id: calendar.id });
    return { inserted, skipped: 0 };
  }

  async syncAllEnabled(): Promise<void> {
    const calendars = await this.listCalendars();
    for (const cal of calendars.filter((c) => c.enabled)) {
      try {
        await this.syncCalendar(cal);
      } catch (err) {
        console.warn('[calendar] sync failed for', cal.name, err);
      }
    }
  }
}

type ICalEventWithMeta = ical.VEvent & {
  alarms?: Array<{ trigger?: string | number | Date | null }>;
  recurrenceid?: string | Date | null;
  datetype?: string;
};

function extractReminderMinutes(alarms: Array<{ trigger?: string | number | Date | null }>): number | null {
  const triggers = alarms
    .map((a) => a?.trigger)
    .filter(Boolean)
    .map((tr) => {
      if (typeof tr === 'number') return tr / 60_000;
      if (typeof tr === 'string') {
        // Example: -PT15M
        const match = tr.match(/-?PT(\d+)M/i);
        if (match) return -Number(match[1]);
      }
      if (tr && typeof tr === 'object' && 'getTime' in tr) {
        return ((tr as Date).getTime() - Date.now()) / 60_000;
      }
      return null;
    })
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
  if (!triggers.length) return null;
  const minutes = Math.min(...triggers);
  return minutes < 0 ? Math.abs(minutes) : minutes;
}

function hasDateOnlyFlag(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return Boolean((value as { dateOnly?: boolean }).dateOnly);
}

let calendarRepoSingleton: CalendarRepository | null = null;

export function getCalendarRepository(): CalendarRepository {
  if (calendarRepoSingleton) return calendarRepoSingleton;
  const { api } = store.registerModule({
    name: MODULE,
    schema: () => calendarTables as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>,
    migrations: [],
    bootstrap: ({ db, emitChange }) => new CalendarRepository(db, emitChange),
  }) as unknown as { api: CalendarRepository };
  calendarRepoSingleton = (api as CalendarRepository | undefined) ?? new CalendarRepository(store.getDatabase(), () => undefined);
  return calendarRepoSingleton;
}

export type { Calendar, CalendarEvent } from './types.js';
