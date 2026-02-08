import type { IpcMain } from 'electron'
import type { NotificationOptions } from '@stina/shared'
import type { Logger } from '@stina/core'
import { showNotification, isWindowFocused, focusWindow, getAvailableSounds } from '../notifications.js'

/**
 * Register notification IPC handlers.
 * These are registered separately so they work in both local and remote modes.
 */
export function registerNotificationIpcHandlers(ipcMain: IpcMain, logger: Logger): void {
  ipcMain.handle('notification-show', (_event, options: NotificationOptions) => {
    return showNotification(options)
  })

  ipcMain.handle('notification-check-focus', () => {
    return isWindowFocused()
  })

  ipcMain.handle('notification-focus-app', () => {
    focusWindow()
  })

  ipcMain.handle('notification-get-sound-support', () => {
    return {
      supported: true,
      sounds: getAvailableSounds(),
    }
  })

  logger.info('Notification IPC handlers registered')
}
