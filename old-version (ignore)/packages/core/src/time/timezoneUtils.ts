/**
 * Shared timezone utility functions used across the application.
 * These functions handle UTC offset formatting, parsing, and timezone calculations.
 */

/**
 * Formats a UTC offset in minutes to `UTC±HH:MM`.
 * @param offsetMinutes The UTC offset in minutes (positive for east of UTC, negative for west)
 * @returns Formatted string like "UTC+02:00" or "UTC-05:00"
 */
export function formatUtcOffset(offsetMinutes: number): string {
  const total = Math.abs(offsetMinutes);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/**
 * Parses a "GMT±H" / "GMT±HH:MM" / "UTC±H" / "UTC±HH:MM" offset string into minutes.
 * @param value Offset string like "GMT+2", "UTC-05:30", "GMT", etc.
 * @returns The offset in minutes, or null if parsing fails
 */
export function parseGmtOffset(value: string): number | null {
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
 * @param date The date for which to compute the offset (important for DST)
 * @param timeZone IANA timezone name (e.g., "Europe/Stockholm", "America/New_York")
 * @returns The UTC offset in minutes for the given date and timezone
 * @throws Error if the timezone is invalid
 */
export function getUtcOffsetMinutesForTimeZone(date: Date, timeZone: string): number {
  const tzName = (() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset',
      }).formatToParts(date);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    } catch (err) {
      // Fallback to 'short' if 'shortOffset' is not supported
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          timeZoneName: 'short',
        }).formatToParts(date);
        return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
      } catch {
        // If both fail, the timezone is likely invalid
        throw new Error(`Invalid timezone: ${timeZone}`);
      }
    }
  })();
  return parseGmtOffset(tzName) ?? 0;
}

/**
 * Validates that a timezone string is a valid IANA timezone identifier.
 * @param timeZone The timezone string to validate
 * @returns true if valid, false otherwise
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    // Try to use the timezone in a DateTimeFormat - this will throw if invalid
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
