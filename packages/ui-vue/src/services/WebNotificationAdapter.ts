import type { NotificationOptions, NotificationResult } from '@stina/shared'
import type { NotificationAdapter } from './NotificationService.js'

/**
 * Web browser implementation of NotificationAdapter.
 * Uses the Web Notifications API.
 */
export class WebNotificationAdapter implements NotificationAdapter {
  private onNotificationClick?: () => void

  /**
   * Create a new WebNotificationAdapter
   * @param onNotificationClick - Callback to execute when a notification is clicked
   */
  constructor(onNotificationClick?: () => void) {
    this.onNotificationClick = onNotificationClick
  }

  /**
   * Show a notification using the Web Notifications API
   */
  async show(options: NotificationOptions): Promise<NotificationResult> {
    // Check if Notifications API is available
    if (!('Notification' in window)) {
      return { shown: false, reason: 'permission-denied' }
    }

    // Check if permission is denied
    if (Notification.permission === 'denied') {
      return { shown: false, reason: 'permission-denied' }
    }

    // Request permission if not yet granted
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return { shown: false, reason: 'permission-denied' }
      }
    }

    // Create and show the notification
    const notification = new Notification(options.title, {
      body: options.body,
      icon: '/stina-icon.png',
    })

    // Handle notification click
    notification.onclick = () => {
      window.focus()
      // Dispatch navigation event to switch to chat view
      window.dispatchEvent(new CustomEvent('stina-navigate', { detail: { view: 'chat' } }))
      this.onNotificationClick?.()
      notification.close()
    }

    return { shown: true }
  }

  /**
   * Check if the browser window has focus
   */
  checkWindowFocus(): boolean {
    return document.hasFocus() && document.visibilityState === 'visible'
  }

  /**
   * Focus the browser window
   */
  focusWindow(): void {
    window.focus()
  }

  /**
   * Request permission to show notifications
   */
  async requestPermission(): Promise<'granted' | 'denied'> {
    if (!('Notification' in window)) {
      return 'denied'
    }
    const result = await Notification.requestPermission()
    return result === 'granted' ? 'granted' : 'denied'
  }
}
