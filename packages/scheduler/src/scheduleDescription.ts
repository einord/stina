/**
 * Generate a human-readable description for a schedule.
 */
export function getScheduleDescription(
  scheduleType: 'at' | 'cron' | 'interval',
  scheduleValue: string,
  timezone: string | null
): string {
  switch (scheduleType) {
    case 'at': {
      const date = new Date(scheduleValue)
      if (isNaN(date.getTime())) return `At: ${scheduleValue}`
      return `At: ${date.toLocaleString()}`
    }
    case 'cron': {
      const tzSuffix = timezone ? ` (${timezone})` : ''
      return `Cron: ${scheduleValue}${tzSuffix}`
    }
    case 'interval': {
      const ms = parseInt(scheduleValue, 10)
      if (isNaN(ms)) return `Every: ${scheduleValue}ms`
      if (ms < 1000) return `Every ${ms}ms`
      if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`
      if (ms < 3600000) return `Every ${Math.round(ms / 60000)} minutes`
      if (ms < 86400000) return `Every ${Math.round(ms / 3600000)} hours`
      return `Every ${Math.round(ms / 86400000)} days`
    }
    default:
      return 'Unknown schedule'
  }
}
