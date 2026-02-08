import type { IpcMain } from 'electron'
import type { Logger } from '@stina/core'

/**
 * Register IPC handlers for external browser authentication.
 * Used in remote mode when connecting to a remote Stina API.
 */
export function registerAuthIpcHandlers(ipcMain: IpcMain, logger: Logger): void {
  // Import dynamically to avoid circular dependencies
  const authModule = import('../electronAuth.js')

  ipcMain.handle(
    'auth-external-login',
    async (
      _event,
      webUrl: string
    ): Promise<{ accessToken: string; refreshToken: string }> => {
      logger.info('Starting authentication', { webUrl })
      const { electronAuthManager } = await authModule
      return electronAuthManager.authenticate(webUrl)
    }
  )

  ipcMain.handle(
    'auth-get-tokens',
    async (): Promise<{ accessToken: string; refreshToken: string } | null> => {
      const { secureStorage } = await authModule
      return secureStorage.getTokens()
    }
  )

  ipcMain.handle(
    'auth-set-tokens',
    async (
      _event,
      tokens: { accessToken: string; refreshToken: string } | null
    ): Promise<{ success: boolean }> => {
      const { secureStorage } = await authModule
      if (tokens) {
        await secureStorage.setTokens(tokens)
        logger.info('Tokens stored securely')
      } else {
        await secureStorage.clearTokens()
        logger.info('Tokens cleared')
      }
      return { success: true }
    }
  )

  ipcMain.handle('auth-has-tokens', async (): Promise<boolean> => {
    const { secureStorage } = await authModule
    return secureStorage.hasTokens()
  })

  ipcMain.handle('auth-is-secure-storage-available', async (): Promise<boolean> => {
    const { secureStorage } = await authModule
    return secureStorage.isAvailable()
  })

  ipcMain.handle('auth-cancel', async (): Promise<void> => {
    const { electronAuthManager } = await authModule
    electronAuthManager.cancel()
    logger.info('Authentication cancelled')
  })

  logger.info('Auth IPC handlers registered')
}
