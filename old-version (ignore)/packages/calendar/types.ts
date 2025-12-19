import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { calendarsTable, calendarEventsTable } from './schema.js';

export type Calendar = InferSelectModel<typeof calendarsTable>;
export type NewCalendar = InferInsertModel<typeof calendarsTable>;

export type CalendarEvent = InferSelectModel<typeof calendarEventsTable>;
export type NewCalendarEvent = InferInsertModel<typeof calendarEventsTable>;
