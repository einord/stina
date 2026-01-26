import type {
  NotificationOptions,
  NotificationContext,
  NotificationResult,
  NotificationSoundId,
} from '@stina/shared'
import { stripMarkdown } from '../utils/stripMarkdown.js'

/**
 * Sound support information returned by the adapter
 */
export interface SoundSupportInfo {
  /** Whether custom sounds are supported on this platform */
  supported: boolean
  /** Available sound options (only present if supported) */
  sounds?: Array<{ id: NotificationSoundId; labelKey: string }>
}

/**
 * Adapter interface for platform-specific notification implementations
 */
export interface NotificationAdapter {
  /**
   * Show a notification
   */
  show(options: NotificationOptions): Promise<NotificationResult>

  /**
   * Check if the application window is focused
   */
  checkWindowFocus(): boolean

  /**
   * Focus the application window
   */
  focusWindow(): void

  /**
   * Request permission to show notifications (optional)
   */
  requestPermission?(): Promise<'granted' | 'denied'>

  /**
   * Get sound support information for the current platform (optional)
   */
  getSoundSupport?(): Promise<SoundSupportInfo>
}

/**
 * Service for managing notifications across platforms.
 * Uses a platform-specific adapter for actual notification display.
 * Sound is handled by the OS notification system.
 */
export class NotificationService {
  private adapter: NotificationAdapter
  private getCurrentView: () => string

  constructor(adapter: NotificationAdapter, getCurrentView: () => string) {
    this.adapter = adapter
    this.getCurrentView = getCurrentView
  }

  /**
   * Show a notification if appropriate based on current context.
   * Will only show if the window is not focused or user is not in chat view,
   * unless the `force` option is set to true.
   * Sound is handled by the OS notification system.
   */
  async maybeShowNotification(options: NotificationOptions): Promise<NotificationResult> {
    const context: NotificationContext = {
      isWindowFocused: this.adapter.checkWindowFocus(),
      currentView: this.getCurrentView() as 'chat' | 'tools' | 'settings',
    }

    // Show notification if window is not focused or user is not in chat view
    const shouldShow = !context.isWindowFocused || context.currentView !== 'chat'

    if (!shouldShow) {
      return { shown: false, reason: 'window-focused' }
    }

    const strippedBody = stripMarkdown(options.body)
    if (!strippedBody) {
      return { shown: false, reason: 'empty-content' }
    }

    return this.adapter.show({
      ...options,
      body: strippedBody,
    })
  }

  /**
   * Show a test notification (always shows, ignores context).
   * Sound is handled by the OS notification system.
   */
  async showTestNotification(options: NotificationOptions): Promise<NotificationResult> {
    return this.adapter.show({
      ...options,
      body: stripMarkdown(options.body),
    })
  }

  /**
   * Request permission to show notifications
   */
  async requestPermission(): Promise<'granted' | 'denied'> {
    if (this.adapter.requestPermission) {
      return this.adapter.requestPermission()
    }
    return 'granted'
  }

  /**
   * Focus the application window
   */
  focusWindow(): void {
    this.adapter.focusWindow()
  }

  /**
   * Get sound support information for the current platform.
   * Returns supported: false if the adapter doesn't implement this method.
   */
  async getSoundSupport(): Promise<SoundSupportInfo> {
    if (this.adapter.getSoundSupport) {
      return this.adapter.getSoundSupport()
    }
    return { supported: false }
  }
}
