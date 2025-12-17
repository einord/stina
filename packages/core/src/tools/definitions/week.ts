import { t } from '@stina/i18n';
import { getTimeZone } from '@stina/settings';

import { getIsoWeekInfoForYmd, getIsoWeekRange, type IsoWeekInfo, type YmdDate } from '../../time/isoWeek.js';
import type { ToolDefinition } from '../infrastructure/base.js';

type WeekNowSuccess = {
  ok: true;
  timezone: string;
  week_year: number;
  week_number: number;
  start_date: string;
  end_date: string;
};

type WeekOfDateSuccess = WeekNowSuccess & {
  input_date: string;
};

type WeekToDateRangeSuccess = WeekNowSuccess & {
  requested_week_year: number;
  requested_week_number: number;
};

type WeekError = { ok: false; error: string };

/**
 * Extracts YYYY-MM-DD parts from a Date for a given IANA timezone.
 * This is used to derive a "local calendar date" without relying on system timezone.
 */
function getLocalYmdInTimeZone(date: Date, timeZone: string): YmdDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Failed to parse date parts for timezone ${timeZone}`);
  }
  return { year, month, day };
}

/**
 * Parses a date input to a local calendar date (YYYY-MM-DD) in the configured timezone.
 * Accepts:
 * - "YYYY-MM-DD" (interpreted as that calendar day)
 * - ISO 8601 timestamps (interpreted as absolute time, then converted to local calendar date)
 */
function parseDateInputToLocalYmd(input: unknown, timeZone: string): { ymd: YmdDate; normalized: string } {
  if (typeof input !== 'string') {
    throw new Error('date must be a string (YYYY-MM-DD or ISO 8601)');
  }
  const trimmed = input.trim();
  if (!trimmed) throw new Error('date cannot be empty');

  const ymdMatch = trimmed.match(/^(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})$/);
  if (ymdMatch?.groups) {
    const year = Number(ymdMatch.groups.y);
    const month = Number(ymdMatch.groups.m);
    const day = Number(ymdMatch.groups.d);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error('Invalid date');
    }
    return { ymd: { year, month, day }, normalized: trimmed };
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date. Use YYYY-MM-DD or ISO 8601.');
  }

  const ymd = getLocalYmdInTimeZone(parsed, timeZone);
  const normalized = `${String(ymd.year).padStart(4, '0')}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
  return { ymd, normalized };
}

/**
 * Resolves the effective timezone for week calculations.
 * Uses the user's localization.timezone override when available, otherwise system timezone.
 */
async function resolveTimeZone(): Promise<string> {
  const configured = await getTimeZone().catch(() => null);
  return configured?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function toWeekPayload(timeZone: string, info: IsoWeekInfo): WeekNowSuccess {
  return {
    ok: true,
    timezone: timeZone,
    week_year: info.weekYear,
    week_number: info.weekNumber,
    start_date: info.startDate,
    end_date: info.endDate,
  };
}

/**
 * Tool: week_now
 * Returns the current ISO week number and date range for the configured timezone.
 */
export function createWeekNowDefinition(): ToolDefinition {
  async function handleWeekNow(): Promise<WeekNowSuccess | WeekError> {
    try {
      const timeZone = await resolveTimeZone();
      const ymd = getLocalYmdInTimeZone(new Date(), timeZone);
      return toWeekPayload(timeZone, getIsoWeekInfoForYmd(ymd));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'week_now',
      description: t('chat.week_now_tool_description'),
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    handler: handleWeekNow,
  };
}

/**
 * Tool: week_of_date
 * Returns the ISO week number and date range for a given date.
 */
export function createWeekOfDateDefinition(): ToolDefinition {
  async function handleWeekOfDate(args: unknown): Promise<WeekOfDateSuccess | WeekError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const input = payload.date ?? payload.input_date ?? payload.day;
      const timeZone = await resolveTimeZone();
      const { ymd, normalized } = parseDateInputToLocalYmd(input, timeZone);
      const info = getIsoWeekInfoForYmd(ymd);
      return { ...toWeekPayload(timeZone, info), input_date: normalized };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'week_of_date',
      description: t('chat.week_of_date_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: t('chat.week_date_input_description'),
          },
        },
        required: ['date'],
        additionalProperties: false,
      },
    },
    handler: handleWeekOfDate,
  };
}

/**
 * Tool: week_to_date_range
 * Converts an ISO week (year + week number) to the Monday-Sunday date range.
 */
export function createWeekToDateRangeDefinition(): ToolDefinition {
  async function handleWeekToDateRange(args: unknown): Promise<WeekToDateRangeSuccess | WeekError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const weekYearRaw = payload.week_year ?? payload.weekYear ?? payload.year;
      const weekNumberRaw = payload.week_number ?? payload.weekNumber ?? payload.week;

      const weekYear = Number(weekYearRaw);
      const weekNumber = Number(weekNumberRaw);
      if (!Number.isFinite(weekYear) || !Number.isFinite(weekNumber)) {
        return { ok: false, error: 'week_year and week_number must be numbers' };
      }

      const timeZone = await resolveTimeZone();
      const range = getIsoWeekRange(weekYear, weekNumber);
      // Use the Monday date to compute a canonical ISO week payload as well.
      const mondayParts = range.startDate.split('-').map((s) => Number(s));
      const info = getIsoWeekInfoForYmd({ year: mondayParts[0], month: mondayParts[1], day: mondayParts[2] });

      return {
        ...toWeekPayload(timeZone, { ...info, startDate: range.startDate, endDate: range.endDate }),
        requested_week_year: weekYear,
        requested_week_number: weekNumber,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'week_to_date_range',
      description: t('chat.week_to_date_range_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          week_year: {
            type: 'integer',
            description: t('chat.week_year_input_description'),
          },
          week_number: {
            type: 'integer',
            description: t('chat.week_number_input_description'),
          },
        },
        required: ['week_year', 'week_number'],
        additionalProperties: false,
      },
    },
    handler: handleWeekToDateRange,
  };
}

