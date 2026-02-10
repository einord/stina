import type { IpcMain } from 'electron'
import type { Logger } from '@stina/core'
import { checkForUpdate, quitAndInstall, setChannel } from '../autoUpdater.js'
import { getUpdateChannel, setUpdateChannel } from '../connectionStore.js'

export function registerAutoUpdateIpcHandlers(ipcMain: IpcMain, logger: Logger): void {
  ipcMain.handle('auto-update-check', () => {
    checkForUpdate()
  })

  ipcMain.handle('auto-update-quit-and-install', () => {
    quitAndInstall()
  })

  ipcMain.handle('auto-update-get-channel', () => {
    return getUpdateChannel()
  })

  ipcMain.handle('auto-update-set-channel', (_event, channel: 'stable' | 'beta') => {
    setUpdateChannel(channel)
    setChannel(channel)
    checkForUpdate()
    logger.info('Update channel changed', { channel })
  })

  logger.info('Auto-update IPC handlers registered')
}
