import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const calendarsTable = sqliteTable(
  'cal_calendars',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    url: text().notNull(),
    color: text(),
    enabled: integer({ mode: 'boolean' }).notNull().default(true),
    lastSyncedAt: integer({ mode: 'number' }),
    lastHash: text(),
    createdAt: integer({ mode: 'number' }).notNull(),
    updatedAt: integer({ mode: 'number' }).notNull(),
  },
  (table) => ({
    urlIdx: index('idx_cal_calendars_url').on(table.url),
  }),
);

export const calendarEventsTable = sqliteTable(
  'cal_events',
  {
    id: text().primaryKey(),
    calendarId: text()
      .notNull()
      .references(() => calendarsTable.id, { onDelete: 'cascade' }),
    uid: text().notNull(),
    recurrenceId: text(),
    title: text().notNull(),
    description: text(),
    location: text(),
    startTs: integer({ mode: 'number' }).notNull(),
    endTs: integer({ mode: 'number' }).notNull(),
    allDay: integer({ mode: 'boolean' }).notNull().default(false),
    reminderMinutes: integer(),
    lastModified: integer({ mode: 'number' }),
    createdAt: integer({ mode: 'number' }).notNull(),
    updatedAt: integer({ mode: 'number' }).notNull(),
  },
  (table) => ({
    calendarIdx: index('idx_cal_events_calendar').on(table.calendarId, table.startTs),
    uidIdx: index('idx_cal_events_uid').on(table.uid, table.recurrenceId),
  }),
);

export const calendarTables = {
  calendarsTable,
  calendarEventsTable,
};

export type CalendarTables = typeof calendarTables;
