import { describe, expect, it } from 'vitest'
import { getScheduleDescription } from './scheduleDescription.js'

describe('getScheduleDescription', () => {
  describe('at schedule type', () => {
    it('formats valid date strings', () => {
      const date = '2024-12-25T10:30:00Z'
      const result = getScheduleDescription('at', date, null)
      expect(result).toMatch(/^At: /)
      expect(result).toContain('12/25/2024') // Date part should be present
    })

    it('handles invalid date strings', () => {
      const invalidDate = 'not-a-date'
      const result = getScheduleDescription('at', invalidDate, null)
      expect(result).toBe('At: not-a-date')
    })

    it('formats dates with time information', () => {
      const date = new Date('2024-01-15T14:45:00Z').toISOString()
      const result = getScheduleDescription('at', date, null)
      expect(result).toMatch(/^At: /)
      expect(result).toMatch(/2024/)
    })
  })

  describe('cron schedule type', () => {
    it('formats cron expression without timezone', () => {
      const cron = '0 0 * * *'
      const result = getScheduleDescription('cron', cron, null)
      expect(result).toBe('Cron: 0 0 * * *')
    })

    it('formats cron expression with timezone', () => {
      const cron = '0 9 * * MON'
      const result = getScheduleDescription('cron', cron, 'America/New_York')
      expect(result).toBe('Cron: 0 9 * * MON (America/New_York)')
    })

    it('handles complex cron expressions', () => {
      const cron = '*/15 * * * *'
      const result = getScheduleDescription('cron', cron, 'UTC')
      expect(result).toBe('Cron: */15 * * * * (UTC)')
    })
  })

  describe('interval schedule type', () => {
    it('formats milliseconds for values less than 1 second', () => {
      expect(getScheduleDescription('interval', '500', null)).toBe('Every 500ms')
      expect(getScheduleDescription('interval', '100', null)).toBe('Every 100ms')
      expect(getScheduleDescription('interval', '999', null)).toBe('Every 999ms')
    })

    it('formats seconds for values 1-59 seconds', () => {
      expect(getScheduleDescription('interval', '1000', null)).toBe('Every 1s')
      expect(getScheduleDescription('interval', '5000', null)).toBe('Every 5s')
      expect(getScheduleDescription('interval', '30000', null)).toBe('Every 30s')
      expect(getScheduleDescription('interval', '59000', null)).toBe('Every 59s')
    })

    it('formats minutes for values 1-59 minutes', () => {
      expect(getScheduleDescription('interval', '60000', null)).toBe('Every 1 minutes')
      expect(getScheduleDescription('interval', '300000', null)).toBe('Every 5 minutes')
      expect(getScheduleDescription('interval', '1800000', null)).toBe('Every 30 minutes')
    })

    it('formats hours for values 1-23 hours', () => {
      expect(getScheduleDescription('interval', '3600000', null)).toBe('Every 1 hours')
      expect(getScheduleDescription('interval', '7200000', null)).toBe('Every 2 hours')
      expect(getScheduleDescription('interval', '43200000', null)).toBe('Every 12 hours')
    })

    it('formats days for values >= 24 hours', () => {
      expect(getScheduleDescription('interval', '86400000', null)).toBe('Every 1 days')
      expect(getScheduleDescription('interval', '172800000', null)).toBe('Every 2 days')
      expect(getScheduleDescription('interval', '604800000', null)).toBe('Every 7 days')
    })

    it('handles rounding for non-exact intervals', () => {
      // 1.5 seconds -> rounds to 2s
      expect(getScheduleDescription('interval', '1500', null)).toBe('Every 2s')
      // 90 seconds -> rounds to 2 minutes
      expect(getScheduleDescription('interval', '90000', null)).toBe('Every 2 minutes')
      // 1.5 hours -> rounds to 2 hours
      expect(getScheduleDescription('interval', '5400000', null)).toBe('Every 2 hours')
    })

    it('handles invalid interval values', () => {
      expect(getScheduleDescription('interval', 'not-a-number', null)).toBe(
        'Every: not-a-numberms'
      )
      expect(getScheduleDescription('interval', 'abc', null)).toBe('Every: abcms')
    })

    it('handles edge case values', () => {
      expect(getScheduleDescription('interval', '0', null)).toBe('Every 0ms')
      expect(getScheduleDescription('interval', '-1000', null)).toBe('Every -1000ms')
    })
  })

  describe('unknown schedule type', () => {
    it('returns unknown schedule message', () => {
      // @ts-expect-error - testing invalid input
      const result = getScheduleDescription('invalid', 'value', null)
      expect(result).toBe('Unknown schedule')
    })
  })
})
