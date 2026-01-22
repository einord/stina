import { Notification, BrowserWindow } from 'electron'
import type { NotificationOptions, NotificationResult } from '@stina/shared'

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
 * Convert sound setting to Electron notification sound value.
 * Matches the working implementation from the old version.
 */
function toElectronSoundValue(sound?: string | null): string | undefined {
  if (!sound || sound === 'default') {
    return undefined
  }

  // Map lowercase IDs to macOS system sound names
  const soundMap: Record<string, string> = {
    glass: 'Glass',
    ping: 'Ping',
    pop: 'Pop',
    basso: 'Basso',
    submarine: 'Submarine',
    hero: 'Hero',
    funk: 'Funk',
    purr: 'Purr',
    sosumi: 'Sosumi',
    none: '',
  }

  return soundMap[sound] || undefined
}

/**
 * Show an OS-native notification
 */
export function showNotification(options: NotificationOptions): NotificationResult {
  const sound = toElectronSoundValue(options.sound)
  const silent = options.sound === 'none'

  console.log('[Notification] input sound:', options.sound, '-> electron sound:', sound, 'silent:', silent)

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
