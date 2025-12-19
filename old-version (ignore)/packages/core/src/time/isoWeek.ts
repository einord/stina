/**
 * ISO week utilities based on ISO-8601 rules:
 * - Weeks start on Monday.
 * - Week 1 is the week with January 4th (equivalently: the week containing the first Thursday).
 *
 * This module intentionally avoids timezone-specific math by operating on calendar dates (YYYY-MM-DD)
 * and using UTC-based Date calculations internally.
 */

export type IsoWeekInfo = {
  /** ISO week-numbering year (can differ from calendar year near Jan/Dec). */
  weekYear: number;
  /** ISO week number (1-53). */
  weekNumber: number;
  /** Monday of the ISO week as YYYY-MM-DD. */
  startDate: string;
  /** Sunday of the ISO week as YYYY-MM-DD. */
  endDate: string;
};

export type YmdDate = { year: number; month: number; day: number };

/**
 * Formats a UTC Date (representing a calendar date) into YYYY-MM-DD.
 */
function formatUtcYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns ISO week info for a calendar date expressed as (year, month, day).
 * @param ymd Calendar date (month: 1-12).
 */
export function getIsoWeekInfoForYmd(ymd: YmdDate): IsoWeekInfo {
  const base = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  // Monday=0..Sunday=6
  const day = (base.getUTCDay() + 6) % 7;

  // Move to Thursday of this ISO week.
  const thursday = new Date(base);
  thursday.setUTCDate(base.getUTCDate() - day + 3);

  const weekYear = thursday.getUTCFullYear();

  // First Thursday of the ISO week-year (week 1 is the week containing Jan 4).
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const firstThursday = new Date(jan4);
  firstThursday.setUTCDate(jan4.getUTCDate() - jan4Day + 3);

  const weekNumber =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));

  const monday = new Date(thursday);
  monday.setUTCDate(thursday.getUTCDate() - 3);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    weekYear,
    weekNumber,
    startDate: formatUtcYmd(monday),
    endDate: formatUtcYmd(sunday),
  };
}

/**
 * Computes the Monday/Sunday range for an ISO week in a given ISO week-year.
 * @param weekYear ISO week-numbering year.
 * @param weekNumber ISO week number (1-53).
 */
export function getIsoWeekRange(weekYear: number, weekNumber: number): { startDate: string; endDate: string } {
  if (!Number.isFinite(weekYear) || !Number.isFinite(weekNumber)) {
    throw new Error('Invalid week input');
  }
  if (weekNumber < 1 || weekNumber > 53) {
    throw new Error('Week number must be between 1 and 53');
  }

  // Monday of week 1: take Jan 4, then go back to Monday.
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // Monday=0
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);

  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (weekNumber - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return { startDate: formatUtcYmd(monday), endDate: formatUtcYmd(sunday) };
}

