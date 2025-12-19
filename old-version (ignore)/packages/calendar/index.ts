import crypto from 'node:crypto';
import ical from 'node-ical';

import store from '@stina/store';

import { calendarTables } from './schema.js';
import type { Calendar, CalendarEvent } from './types.js';

const MODULE = 'calendar';
const RECURRENCE_LOOKAHEAD_DAYS = 180;

function uid(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function safeHash(input: string): string {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function normalizeCalendarUrl(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:/i.test(trimmed) && !/^webcal:/i.test(trimmed)) {
    throw new Error('Unsupported calendar URL protocol. Use http(s) or webcal.');
  }
  if (trimmed.toLowerCase().startsWith('webcal://')) return `https://${trimmed.slice('webcal://'.length)}`;
  return trimmed;
}

function toBoolInt(value: boolean | number | null | undefined): number {
  return value ? 1 : 0;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean')
    return String(value);
  try {
    return String(value);
  } catch {
    return null;
  }
}

type ICalEventWithMeta = ical.VEvent & {
  alarms?: Array<{ trigger?: string | number | Date | null }>;
  recurrenceid?: string | Date | null;
  datetype?: string;
  duration?: number;
  start?: Date | ical.DateWithTimeZone | string | number | null;
  end?: Date | ical.DateWithTimeZone | string | number | null;
  exdate?: Record<string, Date | ical.DateWithTimeZone | string | number>;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  if (typeof (value as { toJSDate?: () => Date }).toJSDate === 'function') {
    return (value as { toJSDate: () => Date }).toJSDate();
  }
  return null;
}

function expandRecurringEvents(events: ICalEventWithMeta[]): ICalEventWithMeta[] {
  const rangeStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(Date.now() + RECURRENCE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const expanded: ICalEventWithMeta[] = [];

  for (const ev of events) {
    // Only expand if rrule is an actual rrule instance with a between() helper.
    const rule = ev.rrule as unknown;
    const hasBetween = !!rule && typeof (rule as { between?: unknown }).between === 'function';
    if (hasBetween) {
      const originalStart = toDate(ev.start);
      const originalOffset = originalStart ? originalStart.getTimezoneOffset() : 0;
      const startBase = toDate(ev.start);
      const endBase = toDate(ev.end);
      let duration = startBase && endBase ? Math.max(0, endBase.valueOf() - startBase.valueOf()) : 0;
      if (!duration && ev.duration !== undefined) {
        duration = typeof ev.duration === 'number' ? ev.duration * 1000 : 0;
      }
      if (!duration && ev.datetype === 'date') {
        duration = 24 * 60 * 60 * 1000;
      }
      const occurrences = (
        rule as { between: (a: Date, b: Date, inc?: boolean) => Date[] | unknown[] }
      ).between(rangeStart, rangeEnd, true);
      const exdates = ev.exdate
        ? new Set(
            Object.values(ev.exdate)
              .map((d) => toDate(d))
              .filter(Boolean)
              .map((d) => d!.valueOf()),
          )
        : undefined;

      for (const start of occurrences) {
        const startDate = toDate(start);
        if (!startDate) continue;
        if (exdates && exdates.has(startDate.valueOf())) continue;
        const endDate = new Date(startDate.valueOf() + duration);
        const occurrenceOffset = startDate.getTimezoneOffset();
        const offsetDiffMinutes = occurrenceOffset - originalOffset;
        if (offsetDiffMinutes !== 0) {
          const offsetMs = offsetDiffMinutes * 60 * 1000;
          startDate.setTime(startDate.valueOf() + offsetMs);
          endDate.setTime(endDate.valueOf() + offsetMs);
        }
        expanded.push({
          ...(ev as unknown as Record<string, unknown>),
          start: startDate,
          end: endDate,
          recurrenceid: startDate,
        } as ICalEventWithMeta);
      }
      continue;
    }

    expanded.push(ev);
  }

  return expanded;
}

function normalizeEventEnd(ev: CalendarEvent): CalendarEvent {
  if (!ev.allDay) return ev;
  const adjustedEnd = Math.max(ev.startTs, ev.endTs - 1);
  return { ...ev, endTs: adjustedEnd };
}

class CalendarRepository {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly rawDb: any,
    private readonly emitChange: (payload: { kind: 'calendar' | 'events'; id?: string }) => void,
  ) {}

  onChange(listener: () => void): () => void {
    return store.onChange(MODULE, () => listener());
  }

  async listCalendars(): Promise<Calendar[]> {
    const stmt = this.rawDb.prepare(`
      select id, name, url, color, enabled,
             lastSyncedAt,
             lastHash,
             createdAt,
             updatedAt
      from cal_calendars
      order by updatedAt
    `);
    return stmt.all() as Calendar[];
  }

  async upsertCalendar(payload: { id?: string | null; name: string; url: string; color?: string | null; enabled?: boolean }): Promise<Calendar> {
    const now = Date.now();
    const normalizedUrl = normalizeCalendarUrl(payload.url);
    const selectStmt = this.rawDb.prepare(
      `select id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt
       from cal_calendars where id = @id limit 1`,
    );
    const selectByUrl = this.rawDb.prepare(
      `select id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt
       from cal_calendars where url = @url limit 1`,
    );

    const existing = payload.id
      ? (selectStmt.get({ id: payload.id }) as Calendar | undefined)
      : (selectByUrl.get({ url: normalizedUrl }) as Calendar | undefined);

    const targetId = existing?.id ?? payload.id ?? uid('cal');

    if (existing) {
    this.rawDb
      .prepare(
        `update cal_calendars set name=@name, url=@url, color=@color, enabled=@enabled, updatedAt=@updatedAt where id=@id`,
      )
      .run({
        id: targetId,
        name: payload.name || existing.name,
        url: normalizedUrl,
        color: toStringOrNull(payload.color ?? existing.color) ?? null,
        enabled: toBoolInt(payload.enabled ?? existing.enabled ?? true),
        updatedAt: now,
      });
      const updated = this.rawDb
        .prepare(
          `select id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt from cal_calendars where id=@id`,
        )
        .get({ id: targetId }) as Calendar;
      this.emitChange({ kind: 'calendar', id: targetId });
      return updated;
    }

    this.rawDb
      .prepare(
        `insert into cal_calendars (id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt)
         values (@id, @name, @url, @color, @enabled, null, null, @createdAt, @updatedAt)`,
      )
      .run({
        id: targetId,
        name: payload.name.trim() || normalizedUrl,
        url: normalizedUrl,
        color: toStringOrNull(payload.color) ?? null,
        enabled: toBoolInt(payload.enabled ?? true),
        createdAt: now,
        updatedAt: now,
      });
    const created = this.rawDb
      .prepare(
        `select id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt
         from cal_calendars where id=@id`,
      )
      .get({ id: targetId }) as Calendar;
    this.emitChange({ kind: 'calendar', id: targetId });
    return created;
  }

  async removeCalendar(id: string): Promise<boolean> {
    const res = this.rawDb.prepare(`delete from cal_calendars where id=@id`).run({ id });
    this.emitChange({ kind: 'calendar', id });
    return Number(res?.changes ?? 0) > 0;
  }

  async setEnabled(id: string, enabled: boolean): Promise<Calendar | null> {
    const now = Date.now();
    this.rawDb
      .prepare(`update cal_calendars set enabled=@enabled, updatedAt=@updatedAt where id=@id`)
      .run({ id, enabled: toBoolInt(enabled), updatedAt: now });
    const row = this.rawDb
      .prepare(
        `select id, name, url, color, enabled, lastSyncedAt, lastHash, createdAt, updatedAt
         from cal_calendars where id=@id`,
      )
      .get({ id }) as Calendar | undefined;
    if (row) this.emitChange({ kind: 'calendar', id });
    return row ?? null;
  }

  async listEvents(calendarId?: string, range?: { start?: number; end?: number }): Promise<CalendarEvent[]> {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (calendarId) {
      clauses.push('calendarId = @calendarId');
      params.calendarId = calendarId;
    }
    if (range?.start != null) {
      clauses.push('endTs >= @start'); // include events that overlap the range (may have started earlier)
      params.start = range.start;
    }
    if (range?.end != null) {
      clauses.push('startTs <= @end');
      params.end = range.end;
    }
    const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
    const stmt = this.rawDb.prepare(
      `select id, calendarId, uid, recurrenceId, title, description, location, startTs, endTs, allDay, reminderMinutes, lastModified, createdAt, updatedAt from cal_events ${where} order by startTs asc`,
    );
    const rows = stmt.all(params) as CalendarEvent[];
    return rows.map(normalizeEventEnd);
  }

  async listEventsRange(range: { start: number; end: number }): Promise<CalendarEvent[]> {
    return this.listEvents(undefined, range);
  }

  async parseCalendar(url: string): Promise<{ events: ICalEventWithMeta[]; hash: string; fetchedAt: number }> {
    const normalized = normalizeCalendarUrl(url);
    const raw = await ical.async.fromURL(normalized);
    const rawEvents = Object.values(raw).filter((item) => item?.type === 'VEVENT') as ICalEventWithMeta[];
    const events = expandRecurringEvents(rawEvents);
    const fetchedAt = Date.now();
    const hash = safeHash(JSON.stringify(events.map((e) => ({ uid: e.uid, dtstart: e.start, dtend: e.end, updated: e.lastmodified }))));
    return { events, hash, fetchedAt };
  }

  async persistEvents(
    calendar: Calendar,
    events: ICalEventWithMeta[],
    hash: string,
    fetchedAt: number,
  ): Promise<number> {
    const tx = this.rawDb.transaction(() => {
      this.rawDb.prepare(`delete from cal_events where calendarId = @id`).run({ id: calendar.id });
      const insert = this.rawDb.prepare(
        `insert into cal_events (
          id, calendarId, uid, recurrenceId, title, description, location, startTs, endTs, allDay, reminderMinutes, lastModified, createdAt, updatedAt
        ) values (
          @id, @calendarId, @uid, @recurrenceId, @title, @description, @location, @startTs, @endTs, @allDay, @reminderMinutes, @lastModified, @createdAt, @updatedAt
        )`,
      );
      let count = 0;
      for (const event of events) {
        if (!event.start || !event.end) continue;
        const allDay = Boolean(event.datetype === 'date' || hasDateOnlyFlag(event.start) || hasDateOnlyFlag(event.end));
        let startTs = event.start.valueOf();
        let endTs = event.end.valueOf();
        if (allDay) {
          const start = event.start as Date;
          const end = event.end as Date;
          startTs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).valueOf();
          endTs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).valueOf() - 1;
          if (endTs < startTs) endTs = startTs;
        }
        const reminderMinutes = Array.isArray(event.alarms) && event.alarms.length
          ? extractReminderMinutes(event.alarms)
          : null;
        const recurrenceId = event.recurrenceid ? String(event.recurrenceid) : null;
        insert.run({
          id: uid('cev'),
          calendarId: calendar.id,
          uid: toStringOrNull(event.uid) ?? uid('uid'),
          recurrenceId: toStringOrNull(recurrenceId),
          title: toStringOrNull(event.summary) ?? 'Event',
          description: toStringOrNull(event.description),
          location: toStringOrNull(event.location),
          startTs,
          endTs,
          allDay: toBoolInt(allDay),
          reminderMinutes,
          lastModified: event.lastmodified ? new Date(event.lastmodified).valueOf() : null,
          createdAt: fetchedAt,
          updatedAt: fetchedAt,
        });
        count += 1;
      }
      this.rawDb
        .prepare(
          `update cal_calendars set lastSyncedAt=@lastSyncedAt, lastHash=@lastHash, updatedAt=@updatedAt where id=@id`,
        )
        .run({ id: calendar.id, lastSyncedAt: fetchedAt, lastHash: hash, updatedAt: fetchedAt });
      return count;
    });

    const inserted = tx();
    this.emitChange({ kind: 'events', id: calendar.id });
    return inserted;
  }

  async syncCalendar(calendar: Calendar): Promise<{ inserted: number; skipped: number }> {
    const parsed = await this.parseCalendar(calendar.url);
    const inserted = await this.persistEvents(calendar, parsed.events, parsed.hash, parsed.fetchedAt);
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

function extractReminderMinutes(alarms: Array<{ trigger?: string | number | Date | null }>): number | null {
  const triggers = alarms
    .map((a) => a?.trigger)
    .filter(Boolean)
    .map((tr) => {
      if (typeof tr === 'number') return tr / 60_000;
      if (typeof tr === 'string') {
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
    schema: () => calendarTables,
    migrations: [
      {
        id: 'add-calendar-columns-v1',
        run: async () => {
          const raw = store.getRawDatabase();
          const ensureColumn = (table: string, name: string, ddl: string) => {
            const hasColumn = raw
              .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ? LIMIT 1`)
              .get(name);
            if (hasColumn) return;
            try {
              raw.exec(ddl);
            } catch (err) {
              console.warn(`[calendar] Failed to add column ${name} to ${table}:`, err);
            }
          };
          ensureColumn('cal_calendars', 'lastSyncedAt', 'ALTER TABLE cal_calendars ADD COLUMN lastSyncedAt INTEGER;');
          ensureColumn('cal_calendars', 'lastHash', 'ALTER TABLE cal_calendars ADD COLUMN lastHash TEXT;');
          ensureColumn('cal_calendars', 'color', 'ALTER TABLE cal_calendars ADD COLUMN color TEXT;');
          ensureColumn('cal_calendars', 'enabled', 'ALTER TABLE cal_calendars ADD COLUMN enabled INTEGER DEFAULT 1 NOT NULL;');
          ensureColumn('cal_calendars', 'createdAt', 'ALTER TABLE cal_calendars ADD COLUMN createdAt INTEGER;');
          ensureColumn('cal_calendars', 'updatedAt', 'ALTER TABLE cal_calendars ADD COLUMN updatedAt INTEGER;');
          ensureColumn('cal_events', 'calendarId', 'ALTER TABLE cal_events ADD COLUMN calendarId TEXT;');
          ensureColumn('cal_events', 'recurrenceId', 'ALTER TABLE cal_events ADD COLUMN recurrenceId TEXT;');
          ensureColumn('cal_events', 'startTs', 'ALTER TABLE cal_events ADD COLUMN startTs INTEGER;');
          ensureColumn('cal_events', 'endTs', 'ALTER TABLE cal_events ADD COLUMN endTs INTEGER;');
          ensureColumn('cal_events', 'allDay', 'ALTER TABLE cal_events ADD COLUMN allDay INTEGER DEFAULT 0 NOT NULL;');
          ensureColumn('cal_events', 'reminderMinutes', 'ALTER TABLE cal_events ADD COLUMN reminderMinutes INTEGER;');
          ensureColumn('cal_events', 'lastModified', 'ALTER TABLE cal_events ADD COLUMN lastModified INTEGER;');
          ensureColumn('cal_events', 'createdAt', 'ALTER TABLE cal_events ADD COLUMN createdAt INTEGER;');
          ensureColumn('cal_events', 'updatedAt', 'ALTER TABLE cal_events ADD COLUMN updatedAt INTEGER;');
        },
      },
    ],
    bootstrap: ({ emitChange }) => new CalendarRepository(store.getRawDatabase(), emitChange),
  }) as unknown as { api: CalendarRepository };
  calendarRepoSingleton = api ?? new CalendarRepository(store.getRawDatabase(), () => undefined);
  return calendarRepoSingleton;
}

export type { Calendar, CalendarEvent } from './types.js';
