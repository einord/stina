/**
 * Timezone utility functions for formatting dates with timezone information.
 */

/**
 * Compute the UTC offset in minutes for a given IANA timezone at a specific date.
 */
export function getUtcOffsetMinutesForTimeZone(timeZone: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone })
  return (new Date(utcStr).getTime() - new Date(tzStr).getTime()) / 60_000
}

/**
 * Format a Date as an ISO 8601 string with the timezone offset for the given IANA timezone.
 */
export function toIsoWithTimeZone(date: Date, timeZone: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const offsetMinutes = getUtcOffsetMinutesForTimeZone(timeZone, date)
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offH = pad(Math.floor(absOffset / 60))
  const offM = pad(absOffset % 60)
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${sign}${offH}:${offM}`
}
