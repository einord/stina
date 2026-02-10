import { autoUpdater } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import type { Logger } from '@stina/core'

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  info: { version: string; releaseDate: string; releaseName?: string } | null
  error: string | null
  progress: number | null
}

let mainWindow: BrowserWindow | null = null
let pollInterval: ReturnType<typeof setInterval> | null = null
let updaterLogger: Logger | null = null

function sendState(state: UpdateState) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auto-update-state', state)
  }
}

export function initAutoUpdater(
  window: BrowserWindow,
  logger: Logger,
  options: { channel: 'stable' | 'beta' }
): void {
  mainWindow = window
  updaterLogger = logger

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  if (options.channel === 'beta') {
    autoUpdater.channel = 'beta'
  }

  autoUpdater.on('checking-for-update', () => {
    logger.info('Auto-updater: checking for update')
    sendState({ status: 'checking', info: null, error: null, progress: null })
  })

  autoUpdater.on('update-available', (info) => {
    logger.info('Auto-updater: update available', { version: info.version })
    sendState({
      status: 'available',
      info: { version: info.version, releaseDate: info.releaseDate, releaseName: info.releaseName ?? undefined },
      error: null,
      progress: null,
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    logger.info('Auto-updater: no update available', { version: info.version })
    sendState({ status: 'idle', info: null, error: null, progress: null })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendState({
      status: 'downloading',
      info: null,
      error: null,
      progress: Math.round(progress.percent),
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logger.info('Auto-updater: update downloaded', { version: info.version })
    sendState({
      status: 'downloaded',
      info: { version: info.version, releaseDate: info.releaseDate, releaseName: info.releaseName ?? undefined },
      error: null,
      progress: null,
    })
  })

  autoUpdater.on('error', (err) => {
    logger.warn('Auto-updater error', { error: String(err) })
    sendState({ status: 'error', info: null, error: String(err), progress: null })
  })

  // Initial check
  autoUpdater.checkForUpdates().catch((err) => {
    logger.warn('Auto-updater initial check failed', { error: String(err) })
  })

  // Poll every hour
  pollInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      logger.warn('Auto-updater poll check failed', { error: String(err) })
    })
  }, 3_600_000)
}

export function checkForUpdate(): void {
  autoUpdater.checkForUpdates().catch((err) => {
    updaterLogger?.warn('Auto-updater manual check failed', { error: String(err) })
  })
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}

export function setChannel(channel: 'stable' | 'beta'): void {
  if (channel === 'beta') {
    autoUpdater.channel = 'beta'
    autoUpdater.allowDowngrade = true
  } else {
    autoUpdater.channel = 'latest'
    autoUpdater.allowDowngrade = true
  }
}

export function stopAutoUpdater(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
