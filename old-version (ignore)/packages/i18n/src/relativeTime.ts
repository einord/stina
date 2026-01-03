/**
 * Relative time formatter for due dates with i18n strings.
 * Returns human-friendly strings like "in 3 hours" or "2 days ago".
 * Falls back to the provided absolute formatter for long ranges.
 */
export function formatRelativeTime(
  ts: number,
  opts: {
    t: (path: string, vars?: Record<string, string | number>) => string;
    absoluteFormatter?: Intl.DateTimeFormat;
    now?: number;
    weekThresholdMs?: number;
  },
): string {
  const { t, absoluteFormatter } = opts;
  const now = opts.now ?? Date.now();
  const diff = ts - now;
  const absDiff = Math.abs(diff);

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = opts.weekThresholdMs ?? 7 * day;

  try {
    if (absDiff < minute) {
      return diff > 0 ? t('relative.in_moments') : t('relative.moments_ago');
    }
    if (absDiff < hour) {
      const minutes = Math.floor(absDiff / minute);
      return diff > 0
        ? t('relative.in_minutes', { count: minutes })
        : t('relative.minutes_ago', { count: minutes });
    }
    if (absDiff < day) {
      const hours = Math.floor(absDiff / hour);
      return diff > 0
        ? t('relative.in_hours', { count: hours })
        : t('relative.hours_ago', { count: hours });
    }
    if (absDiff < week) {
      const days = Math.floor(absDiff / day);
      if (days === 1) {
        return diff > 0 ? t('relative.tomorrow') : t('relative.yesterday');
      }
      return diff > 0
        ? t('relative.in_days', { count: days })
        : t('relative.days_ago', { count: days });
    }

    if (absoluteFormatter) {
      return absoluteFormatter.format(new Date(ts));
    }
  } catch {
    // fall through to default
  }
  return new Date(ts).toLocaleString();
}
