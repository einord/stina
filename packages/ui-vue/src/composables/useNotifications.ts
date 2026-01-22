import { inject, type InjectionKey } from 'vue'
import type { NotificationService } from '../services/NotificationService.js'

/**
 * Injection key for the NotificationService
 */
export const notificationServiceKey: InjectionKey<NotificationService> =
  Symbol('notificationService')

/**
 * Composable to access the NotificationService.
 * The actual implementation is provided by the app (web or electron).
 *
 * @throws Error if NotificationService is not provided
 */
export function useNotifications(): NotificationService {
  const service = inject(notificationServiceKey)
  if (!service) {
    throw new Error('NotificationService not provided. Make sure to provide it in the app root.')
  }
  return service
}

/**
 * Try to get the NotificationService, returning null if not available.
 * Use this when notifications are optional.
 */
export function tryUseNotifications(): NotificationService | null {
  return inject(notificationServiceKey, null)
}
