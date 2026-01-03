import fs from 'node:fs'
import path from 'node:path'
import type { ExtensionManifest } from '@stina/core'
import { AppError, ErrorCode } from '@stina/core'

/**
 * Load extension manifests from a directory
 */
export function loadExtensions(extensionsPath: string): ExtensionManifest[] {
  if (!fs.existsSync(extensionsPath)) {
    return []
  }

  const extensions: ExtensionManifest[] = []
  const entries = fs.readdirSync(extensionsPath, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const manifestPath = path.join(extensionsPath, entry.name, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      continue
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as ExtensionManifest

      // Basic validation
      if (!manifest.id || !manifest.version || !manifest.name || !manifest.type) {
        throw new AppError(ErrorCode.EXTENSION_INVALID_MANIFEST, 'Missing required fields', {
          path: manifestPath,
        })
      }

      extensions.push(manifest)
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw new AppError(
        ErrorCode.EXTENSION_LOAD_FAILED,
        `Failed to load extension: ${entry.name}`,
        { path: manifestPath },
        error instanceof Error ? error : undefined
      )
    }
  }

  return extensions
}
