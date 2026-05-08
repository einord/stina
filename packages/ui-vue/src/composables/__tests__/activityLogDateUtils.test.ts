import { describe, expect, it } from 'vitest'
import { localDateToMs, msToLocalDateStr } from '../activityLogDateUtils.js'

describe('localDateToMs', () => {
  it('returns local midnight — not UTC midnight — for the given date string', () => {
    const ms = localDateToMs('2026-05-08')
    const d = new Date(ms)
    // Confirm the local calendar date is what was passed in.
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4) // 0-indexed: 4 = May
    expect(d.getDate()).toBe(8)
    // Local midnight means hours/minutes/seconds are 0.
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })
})

describe('msToLocalDateStr', () => {
  it('round-trips with localDateToMs', () => {
    expect(msToLocalDateStr(localDateToMs('2026-05-08'))).toBe('2026-05-08')
  })

  it('round-trips edge cases (January 1st, December 31st)', () => {
    expect(msToLocalDateStr(localDateToMs('2026-01-01'))).toBe('2026-01-01')
    expect(msToLocalDateStr(localDateToMs('2026-12-31'))).toBe('2026-12-31')
  })
})

describe('"Till" end-of-day offset', () => {
  it('adding 86_400_000 ms gives the start of the next day', () => {
    const startOfDay = localDateToMs('2026-05-08')
    const endOfDayExclusive = startOfDay + 86_400_000
    expect(endOfDayExclusive).toBeGreaterThan(startOfDay)
    // The exclusive upper bound should be local midnight of the next day.
    const next = new Date(endOfDayExclusive)
    expect(next.getDate()).toBe(9)
    expect(next.getHours()).toBe(0)
    expect(next.getMinutes()).toBe(0)
  })

  it('displaying "Till" input subtracts 86_400_000 to get back inclusive day', () => {
    const startOfDay = localDateToMs('2026-05-08')
    const stored = startOfDay + 86_400_000
    expect(msToLocalDateStr(stored - 86_400_000)).toBe('2026-05-08')
  })
})
