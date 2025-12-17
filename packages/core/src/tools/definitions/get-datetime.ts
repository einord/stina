import { t } from '@stina/i18n';

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
 * Formats an ISO timestamp including local timezone offset (not `Z`) for reliable scheduling.
 */
function toIsoWithOffset(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');

  const offsetMinutes = -date.getTimezoneOffset();
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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const utcOffsetMinutes = -now.getTimezoneOffset();

    return {
      ok: true,
      iso: toIsoWithOffset(now),
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

