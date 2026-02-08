/**
 * Extension Storage
 *
 * Manages the local storage of installed extensions.
 */

import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type {
  InstalledExtension,
  InstalledExtensionInfo,
  ExtensionInstallerOptions,
  ManifestValidationResult,
} from './types.js'
import type { ExtensionManifest } from '@stina/extension-api'
import { validateManifestFile } from './validateManifestFile.js'

const INSTALLED_EXTENSIONS_FILE = 'installed-extensions.json'

export class ExtensionStorage {
  private readonly extensionsPath: string
  private readonly logger: ExtensionInstallerOptions['logger']

  constructor(options: ExtensionInstallerOptions) {
    this.extensionsPath = options.extensionsPath
    this.logger = options.logger
    this.ensureDirectoryExists()
  }

  /**
   * Ensures the extensions directory exists
   */
  private ensureDirectoryExists(): void {
    if (!existsSync(this.extensionsPath)) {
      mkdirSync(this.extensionsPath, { recursive: true })
      this.logger?.debug('Created extensions directory', { path: this.extensionsPath })
    }
  }

  /**
   * Gets the path to an extension
   */
  getExtensionPath(extensionId: string): string {
    return join(this.extensionsPath, extensionId)
  }

  /**
   * Gets the path to the installed extensions metadata file
   */
  private getMetadataPath(): string {
    return join(this.extensionsPath, INSTALLED_EXTENSIONS_FILE)
  }

  /**
   * Loads installed extensions metadata
   */
  getInstalledExtensions(): InstalledExtension[] {
    const metadataPath = this.getMetadataPath()

    if (!existsSync(metadataPath)) {
      return []
    }

    try {
      const content = readFileSync(metadataPath, 'utf-8')
      return JSON.parse(content) as InstalledExtension[]
    } catch (error) {
      this.logger?.error('Failed to read installed extensions', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * Saves installed extensions metadata
   */
  private saveInstalledExtensions(extensions: InstalledExtension[]): void {
    const metadataPath = this.getMetadataPath()
    writeFileSync(metadataPath, JSON.stringify(extensions, null, 2))
  }

  /**
   * Checks if an extension is installed
   */
  isInstalled(extensionId: string): boolean {
    const installed = this.getInstalledExtensions()
    return installed.some((ext) => ext.id === extensionId)
  }

  /**
   * Gets info about an installed extension
   */
  getInstalledExtension(extensionId: string): InstalledExtension | undefined {
    const installed = this.getInstalledExtensions()
    return installed.find((ext) => ext.id === extensionId)
  }

  /**
   * Registers an installed extension
   */
  registerExtension(extensionId: string, version: string): InstalledExtension {
    const installed = this.getInstalledExtensions()

    // Remove existing entry if present
    const filtered = installed.filter((ext) => ext.id !== extensionId)

    const newEntry: InstalledExtension = {
      id: extensionId,
      version,
      installedAt: new Date().toISOString(),
      path: this.getExtensionPath(extensionId),
      enabled: true,
    }

    filtered.push(newEntry)
    this.saveInstalledExtensions(filtered)

    this.logger?.info('Extension registered', { extensionId, version })

    return newEntry
  }

  /**
   * Registers an uploaded local extension
   */
  registerUploadedLocalExtension(extensionId: string, version: string): InstalledExtension {
    const installed = this.getInstalledExtensions()

    // Remove existing entry if present
    const filtered = installed.filter((ext) => ext.id !== extensionId)

    const newEntry: InstalledExtension = {
      id: extensionId,
      version,
      installedAt: new Date().toISOString(),
      path: this.getLocalExtensionPath(extensionId),
      enabled: true,
      isUploadedLocal: true,
    }

    filtered.push(newEntry)
    this.saveInstalledExtensions(filtered)

    this.logger?.info('Uploaded local extension registered', { extensionId, version })

    return newEntry
  }

  /**
   * Gets the path to a local extension
   */
  getLocalExtensionPath(extensionId: string): string {
    return join(this.extensionsPath, 'local', extensionId)
  }

  /**
   * Unregisters an extension
   */
  unregisterExtension(extensionId: string): void {
    const installed = this.getInstalledExtensions()
    const filtered = installed.filter((ext) => ext.id !== extensionId)
    this.saveInstalledExtensions(filtered)

    this.logger?.info('Extension unregistered', { extensionId })
  }

  /**
   * Enables or disables an extension
   */
  setEnabled(extensionId: string, enabled: boolean): void {
    const installed = this.getInstalledExtensions()
    const extension = installed.find((ext) => ext.id === extensionId)

    if (extension) {
      extension.enabled = enabled
      this.saveInstalledExtensions(installed)
      this.logger?.info(`Extension ${enabled ? 'enabled' : 'disabled'}`, { extensionId })
    }
  }

  /**
   * Removes an extension's files
   */
  removeExtensionFiles(extensionId: string): void {
    const extension = this.getInstalledExtension(extensionId)

    if (!extension) {
      return
    }

    const extensionPath = extension.path

    if (existsSync(extensionPath)) {
      rmSync(extensionPath, { recursive: true, force: true })
      this.logger?.debug('Removed extension files', { path: extensionPath })
    }
  }

  /**
   * Removes an extension's data files (storage.sqlite, user-storage/)
   * stored in the _data/ directory. Only called on explicit uninstall with deleteData=true.
   */
  removeExtensionData(extensionId: string): void {
    const dataPath = join(this.extensionsPath, '_data', extensionId)

    if (existsSync(dataPath)) {
      rmSync(dataPath, { recursive: true, force: true })
      this.logger?.debug('Removed extension data', { path: dataPath })
    }
  }

  /**
   * Loads the manifest for an installed extension
   */
  loadManifest(extensionId: string): ExtensionManifest | null {
    const extension = this.getInstalledExtension(extensionId)
    const manifestPath = extension
      ? join(extension.path, 'manifest.json')
      : join(this.getExtensionPath(extensionId), 'manifest.json')

    if (!existsSync(manifestPath)) {
      return null
    }

    try {
      const content = readFileSync(manifestPath, 'utf-8')
      return JSON.parse(content) as ExtensionManifest
    } catch (error) {
      this.logger?.error('Failed to load manifest', {
        extensionId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Validates the manifest for an installed extension
   */
  validateManifest(extensionId: string): ManifestValidationResult {
    const extension = this.getInstalledExtension(extensionId)
    const manifestPath = extension
      ? join(extension.path, 'manifest.json')
      : join(this.getExtensionPath(extensionId), 'manifest.json')
    return validateManifestFile(manifestPath)
  }

  /**
   * Gets all installed extensions with their validation status
   */
  getInstalledExtensionsWithValidation(): InstalledExtensionInfo[] {
    const installed = this.getInstalledExtensions()

    return installed.map((ext) => {
      const validation = this.validateManifest(ext.id)
      return {
        ...ext,
        manifestValid: validation.valid,
        manifestErrors: validation.errors.length > 0 ? validation.errors : undefined,
        manifestWarnings: validation.warnings.length > 0 ? validation.warnings : undefined,
      }
    })
  }

  /**
   * Gets all enabled extensions with their manifests
   */
  getEnabledExtensions(): Array<{ installed: InstalledExtension; manifest: ExtensionManifest }> {
    const installed = this.getInstalledExtensions()
    const result: Array<{ installed: InstalledExtension; manifest: ExtensionManifest }> = []

    for (const ext of installed) {
      if (!ext.enabled) continue

      const manifest = this.loadManifest(ext.id)
      if (manifest) {
        result.push({ installed: ext, manifest })
      }
    }

    return result
  }

  /**
   * Scans the extensions directory for any unregistered extensions
   * (useful for detecting manually installed extensions)
   */
  scanForUnregistered(): string[] {
    if (!existsSync(this.extensionsPath)) {
      return []
    }

    const registered = this.getInstalledExtensions().map((e) => e.id)
    const directories = readdirSync(this.extensionsPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => !name.startsWith('.'))

    const unregistered: string[] = []

    for (const dir of directories) {
      if (!registered.includes(dir)) {
        const manifestPath = join(this.extensionsPath, dir, 'manifest.json')
        if (existsSync(manifestPath)) {
          unregistered.push(dir)
        }
      }
    }

    return unregistered
  }
}
