import { t } from '@stina/i18n';
import { getTimeZone } from '@stina/settings';

import { formatUtcOffset, getUtcOffsetMinutesForTimeZone } from '../../time/timezoneUtils.js';
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
