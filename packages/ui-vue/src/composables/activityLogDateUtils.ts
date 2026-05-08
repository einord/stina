/**
 * Pure date-conversion helpers used by ActivityLogView and its tests.
 *
 * All conversions use LOCAL time — activity entry timestamps are displayed
 * in local time, so date inputs must also be parsed/rendered in local time.
 */

/**
 * Convert a "YYYY-MM-DD" date string to local-midnight unix ms.
 * DO NOT use valueAsNumber / Date.parse() — those are UTC.
 */
export function localDateToMs(s: string): number {
  const parts = s.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return new Date(y, m - 1, d).getTime()
}

/**
 * Convert a local-midnight unix ms value to a "YYYY-MM-DD" string
 * suitable for binding to `<input type="date">`.
 */
export function msToLocalDateStr(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}
