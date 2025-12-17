import { t } from '@stina/i18n';
import { getTimeZone } from '@stina/settings';

import type { ToolDefinition } from '../infrastructure/base.js';

type GetDateTimeSuccess = {
  ok: true;
  iso: string;
  epoch_ms: number;
  timezone: string;
  utc_offset_minutes: number;
  utc_offset: string;
};

/**
 * Formats a UTC offset in minutes to `UTC±HH:MM`.
 */
function formatUtcOffset(offsetMinutes: number): string {
  const total = Math.abs(offsetMinutes);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Parses a "GMT±H" / "GMT±HH:MM" offset string into minutes.
 */
function parseGmtOffset(value: string): number | null {
  const match = value.match(/(?:GMT|UTC)(?:(?<sign>[+-])(?<hh>\d{1,2})(?::?(?<mm>\d{2}))?)?/);
  if (!match || !match.groups) return null;
  const sign = match.groups.sign;
  const hh = match.groups.hh;
  const mm = match.groups.mm;
  if (!sign || !hh) return 0;
  const hours = Number(hh);
  const minutes = mm ? Number(mm) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const total = hours * 60 + minutes;
  return sign === '-' ? -total : total;
}

/**
 * Computes the current UTC offset minutes for a given timezone and date.
 */
function getUtcOffsetMinutesForTimeZone(date: Date, timeZone: string): number {
  const tzName = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
      }).formatToParts(date);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    } catch {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'short',
      }).formatToParts(date);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    }
  })();
  return parseGmtOffset(tzName) ?? 0;
}

/**
 * Formats an ISO timestamp including a specific timezone offset (not `Z`) for reliable scheduling.
 */
function toIsoWithTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  const y = get('year');
  const mo = get('month');
  const d = get('day');
  const h = get('hour');
  const mi = get('minute');
  const s = get('second');
  const ms = String(date.getMilliseconds()).padStart(3, '0');

  const offsetMinutes = getUtcOffsetMinutesForTimeZone(date, timeZone);
  const total = Math.abs(offsetMinutes);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const oh = String(Math.floor(total / 60)).padStart(2, '0');
  const om = String(total % 60).padStart(2, '0');

  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${oh}:${om}`;
}

/**
 * Creates the get_datetime tool definition.
 *
 * This tool gives the assistant a reliable "source of truth" for current time and timezone.
 * Use it when the user asks for the current time/date, or before scheduling timepoints to
 * avoid timezone/UTC confusion.
 */
export function createGetDateTimeDefinition(): ToolDefinition {
  async function handleGetDateTime(): Promise<GetDateTimeSuccess> {
    const now = new Date();
    const configured = await getTimeZone().catch(() => null);
    const timezone = configured?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const utcOffsetMinutes = getUtcOffsetMinutesForTimeZone(now, timezone);

    return {
      ok: true,
      iso: toIsoWithTimeZone(now, timezone),
      epoch_ms: now.getTime(),
      timezone,
      utc_offset_minutes: utcOffsetMinutes,
      utc_offset: formatUtcOffset(utcOffsetMinutes),
    };
  }

  return {
    spec: {
      name: 'get_datetime',
      description: t('chat.get_datetime_tool_description'),
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: handleGetDateTime,
  };
}
