import type { BuiltinToolFactory } from '../types.js'

/**
 * Formats a UTC offset in minutes to `UTC±HH:MM`.
 * @param offsetMinutes The UTC offset in minutes (positive for east of UTC, negative for west)
 * @returns Formatted string like "UTC+02:00" or "UTC-05:00"
 */
function formatUtcOffset(offsetMinutes: number): string {
  const total = Math.abs(offsetMinutes)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `UTC${sign}${hh}:${mm}`
}

/**
 * Parses a "GMT±H" / "GMT±HH:MM" / "UTC±H" / "UTC±HH:MM" offset string into minutes.
 * @param value Offset string like "GMT+2", "UTC-05:30", "GMT", etc.
 * @returns The offset in minutes, or null if parsing fails
 */
function parseGmtOffset(value: string): number | null {
  const match = value.match(/(?:GMT|UTC)(?:(?<sign>[+-])(?<hh>\d{1,2})(?::?(?<mm>\d{2}))?)?/)
  if (!match?.groups) return null
  const sign = match.groups['sign']
  const hh = match.groups['hh']
  const mm = match.groups['mm']
  if (!sign || !hh) return 0
  const hours = Number(hh)
  const minutes = mm ? Number(mm) : 0
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  const total = hours * 60 + minutes
  return sign === '-' ? -total : total
}

/**
 * Computes the current UTC offset minutes for a given timezone and date.
 * @param date The date for which to compute the offset (important for DST)
 * @param timeZone IANA timezone name (e.g., "Europe/Stockholm", "America/New_York")
 * @returns The UTC offset in minutes for the given date and timezone
 */
function getUtcOffsetMinutesForTimeZone(date: Date, timeZone: string): number {
  const tzName = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
      }).formatToParts(date)
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    } catch {
      // Fallback to 'short' if 'shortOffset' is not supported
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          timeZoneName: 'short',
        }).formatToParts(date)
        return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
      } catch {
        return 'GMT'
      }
    }
  })()
  return parseGmtOffset(tzName) ?? 0
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
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''

  const y = get('year')
  const mo = get('month')
  const d = get('day')
  const h = get('hour')
  const mi = get('minute')
  const s = get('second')
  const ms = String(date.getMilliseconds()).padStart(3, '0')

  const offsetMinutes = getUtcOffsetMinutesForTimeZone(date, timeZone)
  const total = Math.abs(offsetMinutes)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const oh = String(Math.floor(total / 60)).padStart(2, '0')
  const om = String(total % 60).padStart(2, '0')

  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${oh}:${om}`
}

/**
 * Validates that a timezone string is a valid IANA timezone identifier.
 */
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/**
 * Factory function that creates the datetime tool with access to user settings.
 * This tool gives the assistant a reliable "source of truth" for current time and timezone.
 */
export const createDateTimeTool: BuiltinToolFactory = (context) => ({
  id: 'stina.builtin.get_datetime',
  name: 'Get Date and Time',
  description:
    'Get the current date and time. Use this tool when you need to know the current date, ' +
    'time, or when you need temporal context for scheduling or time-related tasks. ' +
    'Returns ISO timestamp with timezone offset, epoch milliseconds, and UTC offset information.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  execute: async () => {
    const now = new Date()

    // Get timezone from user settings, fallback to system timezone, then UTC
    let timezone: string
    try {
      const configured = await context.getTimezone()
      timezone = configured?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    }

    // Validate timezone and fallback to UTC if invalid
    if (!isValidTimeZone(timezone)) {
      timezone = 'UTC'
    }

    const utcOffsetMinutes = getUtcOffsetMinutesForTimeZone(now, timezone)

    return {
      success: true,
      data: {
        iso: toIsoWithTimeZone(now, timezone),
        epoch_ms: now.getTime(),
        timezone,
        utc_offset_minutes: utcOffsetMinutes,
        utc_offset: formatUtcOffset(utcOffsetMinutes),
      },
    }
  },
})
