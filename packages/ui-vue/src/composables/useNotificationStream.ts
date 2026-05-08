import { ref, onMounted, onUnmounted } from 'vue'
import type { NotificationEvent } from '@stina/api-client'
import { useApi } from './useApi.js'
import { tryUseNotifications } from './useNotifications.js'

/**
 * Composable for the redesign-2026 notification stream.
 *
 * On mount:
 *   - Seeds `recent` from GET /notifications (last 20 items).
 *   - Subscribes to the live notification stream.
 *   - When a new event arrives, prepends to `recent` and increments
 *     `unreadCount`. When `document.hidden` is true, also fires an OS-level
 *     browser notification (permission-gated; opt-in via the bell icon).
 *   - Passes `tag: notif:${event.thread_id}` so two open tabs collapse to
 *     one OS-level pop-up (replacing rather than stacking).
 *
 * On unmount: disposes the subscription.
 *
 * v1 limitations:
 *   - `unreadCount` is in-memory; closing the tab resets it.
 *   - Events fired during a brief client disconnect are lost (no buffering).
 *   - Catch-up on reconnect is via the seed from `list()`.
 */
export function useNotificationStream() {
  const api = useApi()
  const recent = ref<NotificationEvent[]>([])
  const unreadCount = ref(0)

  let unsubscribe: (() => void) | null = null

  function markRead() {
    unreadCount.value = 0
  }

  onMounted(async () => {
    // Seed from the REST list on mount.
    try {
      const seeded = await api.notifications.list({ limit: 20 })
      recent.value = seeded
    } catch {
      // Non-fatal — the stream will populate on new events.
    }

    // Subscribe to the live stream.
    unsubscribe = api.notifications.streamSubscribe((event) => {
      // Prepend to keep newest-first.
      recent.value = [event, ...recent.value].slice(0, 100)
      unreadCount.value += 1

      // Browser notification when the document is hidden (user on another tab).
      if (typeof document !== 'undefined' && document.hidden) {
        const notifService = tryUseNotifications()
        if (notifService) {
          void notifService.maybeShowNotification({
            title: event.title,
            body: event.preview || event.title,
            tag: `notif:${event.thread_id}`,
          })
        }
      }
    })
  })

  onUnmounted(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    recent,
    unreadCount,
    markRead,
  }
}
