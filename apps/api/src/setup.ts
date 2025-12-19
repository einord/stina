import { extensionRegistry, themeRegistry } from '@stina/core'
import { builtinExtensions, loadExtensions, getExtensionsPath } from '@stina/adapters-node'
import type { Logger } from '@stina/core'

/**
 * Setup extensions and themes
 */
export function setupExtensions(logger: Logger): void {
  // Clear registries
  extensionRegistry.clear()
  themeRegistry.clear()

  // Register built-in extensions (themes)
  for (const ext of builtinExtensions) {
    extensionRegistry.register(ext)
    logger.debug('Registered built-in extension', { id: ext.id })
  }

  // Load user extensions
  try {
    const extensionsPath = getExtensionsPath()
    const userExtensions = loadExtensions(extensionsPath)

    for (const ext of userExtensions) {
      extensionRegistry.register(ext)
      logger.debug('Registered user extension', { id: ext.id })
    }
  } catch (error) {
    logger.warn('Failed to load user extensions', { error: String(error) })
  }

  // Register themes from all extensions
  for (const theme of extensionRegistry.getThemes()) {
    themeRegistry.registerTheme(theme.id, theme.label, theme.tokens)
    logger.debug('Registered theme', { id: theme.id })
  }

  logger.info('Extensions setup complete', {
    extensions: extensionRegistry.list().length,
    themes: themeRegistry.listThemes().length,
  })
}
