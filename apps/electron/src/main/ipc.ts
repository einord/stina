import type { IpcMain } from 'electron'
import type { Greeting } from '@stina/shared'
import type { ThemeRegistry, ExtensionRegistry, Logger } from '@stina/core'

export interface IpcContext {
  getGreeting: (name?: string) => Greeting
  themeRegistry: ThemeRegistry
  extensionRegistry: ExtensionRegistry
  logger: Logger
}

/**
 * Register all IPC handlers for renderer <-> main communication
 */
export function registerIpcHandlers(ipcMain: IpcMain, ctx: IpcContext): void {
  const { getGreeting, themeRegistry, extensionRegistry, logger } = ctx

  // Get app version
  ipcMain.handle('get-version', () => {
    return process.env['npm_package_version'] || '0.5.0'
  })

  // Greeting
  ipcMain.handle('get-greeting', (_event, name?: string) => {
    logger.debug('IPC: get-greeting', { name })
    return getGreeting(name)
  })

  // Themes
  ipcMain.handle('get-themes', () => {
    logger.debug('IPC: get-themes')
    return themeRegistry.listThemes()
  })

  ipcMain.handle('get-theme-tokens', (_event, id: string) => {
    logger.debug('IPC: get-theme-tokens', { id })
    const theme = themeRegistry.getTheme(id)
    if (!theme) {
      throw new Error(`Theme not found: ${id}`)
    }
    return theme.tokens
  })

  // Extensions
  ipcMain.handle('get-extensions', () => {
    logger.debug('IPC: get-extensions')
    return extensionRegistry.list().map((ext) => ({
      id: ext.id,
      name: ext.name,
      version: ext.version,
      type: ext.type,
    }))
  })

  // Health check
  ipcMain.handle('health', () => {
    return { ok: true }
  })

  logger.info('IPC handlers registered')
}
