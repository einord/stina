import type { BuiltinToolFactory, ToolExecutionContext } from '../types.js'
import { createTranslator } from '@stina/i18n'

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
  const match = value.match(/^(?:GMT|UTC)(?:(?<sign>[+-])(?<hh>\d{1,2})(?::?(?<mm>\d{2}))?)?$/)
  if (!match) return null
  const groups = match.groups!
  const sign = groups['sign']
  const hh = groups['hh']
  const mm = groups['mm']
  // Bare "GMT" or "UTC" (no offset specified) means UTC+0
  if (!sign) return 0
  // At this point, both sign and hh are present due to regex structure
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

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''

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

// Create translators for supported languages
const translators = {
  en: createTranslator('en'),
  sv: createTranslator('sv'),
}

/**
 * Factory function that creates the datetime tool with access to user settings.
 * This tool gives the assistant a reliable "source of truth" for current time and timezone.
 */
export const createDateTimeTool: BuiltinToolFactory = (context) => ({
  id: 'stina.builtin.get_datetime',
  name: {
    en: translators.en.t('tools.builtin.get_datetime.name'),
    sv: translators.sv.t('tools.builtin.get_datetime.name'),
  },
  description: {
    en: translators.en.t('tools.builtin.get_datetime.description'),
    sv: translators.sv.t('tools.builtin.get_datetime.description'),
  },
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  execute: async (_params: Record<string, unknown>, executionContext?: ToolExecutionContext) => {
    const now = new Date()

    // Get timezone from execution context (preferred), fallback to system timezone, then UTC
    const configuredTimezone = executionContext?.timezone
    let timezone = configuredTimezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

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
