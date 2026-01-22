import type { NotificationOptions, NotificationResult } from '@stina/shared'
import type { NotificationAdapter } from '@stina/ui-vue'

/**
 * Sound support information
 */
interface SoundSupportInfo {
  supported: boolean
  sounds?: Array<{ id: string; labelKey: string }>
}

/**
 * Type for Electron API exposed via preload script
 */
interface ElectronNotificationAPI {
  notificationShow?: (options: NotificationOptions) => Promise<NotificationResult>
  notificationCheckFocus?: () => Promise<boolean>
  notificationFocusApp?: () => Promise<void>
  notificationGetSoundSupport?: () => Promise<SoundSupportInfo>
  onNotificationClicked?: (handler: (action: string) => void) => void
}

/**
 * Get the electronAPI from window if available
 */
function getElectronAPI(): ElectronNotificationAPI | undefined {
  if (typeof window !== 'undefined') {
    return (window as unknown as { electronAPI?: ElectronNotificationAPI }).electronAPI
  }
  return undefined
}

/**
 * Electron implementation of NotificationAdapter.
 * Uses IPC to communicate with the main process for native notifications.
 */
export class ElectronNotificationAdapter implements NotificationAdapter {
  private onNotificationClick?: () => void

  /**
   * Create a new ElectronNotificationAdapter
   * @param onNotificationClick - Callback to execute when a notification is clicked
   */
  constructor(onNotificationClick?: () => void) {
    this.onNotificationClick = onNotificationClick

    // Listen for notification click events from main process
    const api = getElectronAPI()
    if (api?.onNotificationClicked) {
      api.onNotificationClicked((action: string) => {
        if (action === 'focus-chat') {
          // Dispatch navigation event to switch to chat view
          window.dispatchEvent(new CustomEvent('stina-navigate', { detail: { view: 'chat' } }))
          this.onNotificationClick?.()
        }
      })
    }
  }

  /**
   * Show a notification via IPC to main process
   */
  async show(options: NotificationOptions): Promise<NotificationResult> {
    const api = getElectronAPI()
    if (!api?.notificationShow) {
      return { shown: false, reason: 'permission-denied' }
    }

    return api.notificationShow(options)
  }

  /**
   * Check if the window has focus and is visible.
   * Uses document APIs as synchronous IPC calls are not available.
   */
  checkWindowFocus(): boolean {
    return document.visibilityState === 'visible' && document.hasFocus()
  }

  /**
   * Focus the application window via IPC
   */
  focusWindow(): void {
    const api = getElectronAPI()
    api?.notificationFocusApp?.()
  }

  /**
   * Get sound support information from the main process
   */
  async getSoundSupport(): Promise<SoundSupportInfo> {
    const api = getElectronAPI()
    if (!api?.notificationGetSoundSupport) {
      return { supported: false }
    }
    return api.notificationGetSoundSupport()
  }
}
