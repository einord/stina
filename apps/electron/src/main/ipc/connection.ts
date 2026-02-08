import type { IpcMain, App } from 'electron'
import type { Logger, ConnectionConfig } from '@stina/core'
import { getConnectionConfig, setConnectionConfig } from '../connectionStore.js'

/**
 * Connection test timeout in milliseconds
 */
const CONNECTION_TEST_TIMEOUT_MS = 10000

/**
 * Register IPC handlers for connection configuration.
 * These handlers are registered before other handlers and work in all modes.
 */
export function registerConnectionIpcHandlers(ipcMain: IpcMain, app: App, logger: Logger): void {
  ipcMain.handle('connection-get-config', (): ConnectionConfig => {
    return getConnectionConfig()
  })

  ipcMain.handle(
    'connection-set-config',
    (_event, config: ConnectionConfig): { success: boolean; requiresRestart: boolean } => {
      logger.info('Setting connection config', { mode: config.mode, hasWebUrl: !!config.webUrl })
      setConnectionConfig(config)
      return { success: true, requiresRestart: true }
    }
  )

  ipcMain.handle(
    'connection-test',
    async (_event, url: string): Promise<{ success: boolean; error?: string }> => {
      logger.info('Testing connection', { url })
      try {
        const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url
        const healthUrl = `${normalizedUrl}/health`

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS)

        try {
          const response = await fetch(healthUrl, {
            signal: controller.signal,
          })

          if (response.ok) {
            const data = await response.json()
            if (data.ok === true) {
              return { success: true }
            }
          }

          return { success: false, error: `Server responded with status ${response.status}` }
        } finally {
          clearTimeout(timeoutId)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.warn('Connection test failed', { url, error: errorMessage })

        if (errorMessage.includes('abort')) {
          return { success: false, error: 'Connection timed out' }
        }

        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('app-restart', (): void => {
    logger.info('Restarting application')
    app.relaunch()
    app.exit(0)
  })

  logger.info('Connection IPC handlers registered')
}
