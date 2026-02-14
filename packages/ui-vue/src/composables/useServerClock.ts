import { ref, onMounted, onUnmounted } from 'vue'
import { useApi } from './useApi.js'

/**
 * Composable that provides a reactive server-synced clock display.
 * Fetches server time once on mount to calculate offset from client clock,
 * then updates the display every minute using a local timer.
 * Re-syncs with the server every hour.
 */
export function useServerClock() {
  const api = useApi()
  const formattedDateTime = ref('')

  let offsetMs = 0
  let minuteTimer: ReturnType<typeof setInterval> | undefined
  let resyncTimer: ReturnType<typeof setInterval> | undefined
  let timezone = 'UTC'
  let locale = 'en'

  function formatDateTime(date: Date): string {
    const formatted = new Intl.DateTimeFormat(locale === 'sv' ? 'sv-SE' : 'en-US', {
      timeZone: timezone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)

    if (locale === 'sv') {
      // Swedish: "fredag 14 februari 15:30" → "fredag 14 februari kl 15:30"
      return formatted.replace(/(\d{2}):(\d{2})/, 'kl $1:$2')
    }

    return formatted
  }

  function updateDisplay() {
    const serverNow = new Date(Date.now() + offsetMs)
    formattedDateTime.value = formatDateTime(serverNow)
  }

  async function syncTime() {
    try {
      const serverTime = await api.getServerTime()
      offsetMs = serverTime.epochMs - Date.now()
      timezone = serverTime.timezone
      locale = serverTime.language
      updateDisplay()
    } catch {
      // If fetch fails, just show client time with defaults
      updateDisplay()
    }
  }

  onMounted(async () => {
    await syncTime()
    minuteTimer = setInterval(updateDisplay, 60_000)
    resyncTimer = setInterval(syncTime, 3_600_000)
  })

  onUnmounted(() => {
    if (minuteTimer) clearInterval(minuteTimer)
    if (resyncTimer) clearInterval(resyncTimer)
  })

  return { formattedDateTime }
}
