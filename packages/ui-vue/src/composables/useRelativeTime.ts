import { ref, computed, onMounted, onUnmounted, type ComputedRef } from 'vue'
import { t, getLang } from '@stina/i18n'

const TICK_INTERVAL_MS = 30_000

const sharedNow = ref(Date.now())
let tickerHandle: ReturnType<typeof setInterval> | null = null
let tickerSubscribers = 0

function startTickerIfNeeded(): void {
  if (tickerHandle !== null) return
  tickerHandle = setInterval(() => {
    sharedNow.value = Date.now()
  }, TICK_INTERVAL_MS)
}

function stopTickerIfUnused(): void {
  if (tickerSubscribers > 0 || tickerHandle === null) return
  clearInterval(tickerHandle)
  tickerHandle = null
}

function getLocale(): string {
  return getLang() === 'sv' ? 'sv-SE' : 'en-US'
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
}

/**
 * Format an absolute timestamp as a discreet, human-friendly relative string.
 * Uses the active i18n language for locale-correct date formatting and
 * translation of phrases like "yesterday at" / "igår kl".
 */
export function formatRelativeTime(target: Date | string | number, nowMs: number): string {
  const date = target instanceof Date ? target : new Date(target)
  if (Number.isNaN(date.getTime())) return ''

  const locale = getLocale()
  const now = new Date(nowMs)
  const diffMs = nowMs - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  // Within the last 45 seconds → "just now"
  if (diffMs < 45_000 && diffMs > -60_000) {
    return t('chat.time.just_now')
  }

  // Within the last hour → "X min ago"
  if (diffMin < 60 && diffMin >= 1) {
    return t('chat.time.minutes_ago', { count: diffMin })
  }

  const time = formatTime(date, locale)

  // Same calendar day
  if (isSameCalendarDay(date, now)) {
    return t('chat.time.today_at', { time })
  }

  // Yesterday
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameCalendarDay(date, yesterday)) {
    return t('chat.time.yesterday_at', { time })
  }

  // Within the last 7 days → "Tuesday at 14:30"
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  if (date >= sevenDaysAgo) {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
    return t('chat.time.weekday_at', { weekday, time })
  }

  // Same year → "12 March at 14:30"
  let dateLabel: string
  if (date.getFullYear() === now.getFullYear()) {
    dateLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(date)
  } else {
    dateLabel = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date)
  }
  return t('chat.time.date_at', { date: dateLabel, time })
}

/**
 * Vue composable that returns a reactive, formatted relative-time string for
 * a given timestamp. The string updates automatically (every 30s) so phrases
 * like "5 min ago" stay accurate while the chat is open.
 */
export function useRelativeTime(target: () => Date | string | number | undefined): ComputedRef<string> {
  onMounted(() => {
    tickerSubscribers += 1
    startTickerIfNeeded()
  })

  onUnmounted(() => {
    tickerSubscribers = Math.max(0, tickerSubscribers - 1)
    stopTickerIfUnused()
  })

  return computed(() => {
    const value = target()
    if (value === undefined || value === null || value === '') return ''
    return formatRelativeTime(value, sharedNow.value)
  })
}
