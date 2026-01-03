import { describe, expect, it } from 'vitest';

import { getIsoWeekInfoForYmd, getIsoWeekRange } from '../src/time/isoWeek.js';

describe('ISO week utils', () => {
  it('computes known ISO week numbers', () => {
    // ISO week 1 of 2015 starts on 2014-12-29.
    const w = getIsoWeekInfoForYmd({ year: 2015, month: 1, day: 1 });
    expect(w.weekYear).toBe(2015);
    expect(w.weekNumber).toBe(1);
    expect(w.startDate).toBe('2014-12-29');
    expect(w.endDate).toBe('2015-01-04');
  });

  it('computes date ranges for weeks', () => {
    const range = getIsoWeekRange(2025, 23);
    // Week 23 of 2025 is Monday 2025-06-02 to Sunday 2025-06-08.
    expect(range.startDate).toBe('2025-06-02');
    expect(range.endDate).toBe('2025-06-08');
  });
});

