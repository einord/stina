import { Notification, BrowserWindow } from 'electron'
import type { NotificationOptions, NotificationResult } from '@stina/shared'
import { getPlatformSound, getAvailableSounds, type SoundOption } from './notifications/sounds/index.js'

export { getAvailableSounds, type SoundOption }

let mainWindow: BrowserWindow | null = null

/**
 * Set the main window reference for notification handling
 */
export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

/**
 * Get the current main window reference
 */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Show an OS-native notification
 */
export function showNotification(options: NotificationOptions): NotificationResult {
  try {
    const soundId = options.sound ?? 'default'
    const sound = getPlatformSound(soundId)
    const silent = soundId === 'none'

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent,
      sound,
    })

    notification.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.focus()

        // Send navigation event to renderer
        if (!mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('notification-clicked', options.clickAction)
        }
      }
    })

    notification.show()
    return { shown: true }
  } catch (error) {
    console.error('Failed to show notification:', error)
    return { shown: false, reason: 'error' }
  }
}

/**
 * Check if the main window is focused
 */
export function isWindowFocused(): boolean {
  return mainWindow?.isFocused() ?? false
}

/**
 * Focus the main application window
 */
export function focusWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }
}
