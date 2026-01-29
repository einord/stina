/**
 * Extension Installer
 *
 * Main class that orchestrates extension installation, uninstallation,
 * and management.
 */

import { RegistryClient } from './RegistryClient.js'
import { GitHubInstaller } from './GitHubInstaller.js'
import { ExtensionStorage } from './ExtensionStorage.js'
import type {
  ExtensionInstallerOptions,
  ExtensionListItem,
  ExtensionDetails,
  InstalledExtension,
  InstalledExtensionInfo,
  InstallResult,
  SearchOptions,
} from './types.js'
import type { ExtensionManifest } from '@stina/extension-api'

export class ExtensionInstaller {
  private readonly registryClient: RegistryClient
  private readonly gitHubInstaller: GitHubInstaller
  private readonly storage: ExtensionStorage
  private readonly options: ExtensionInstallerOptions

  constructor(options: ExtensionInstallerOptions) {
    this.options = options
    this.registryClient = new RegistryClient(options)
    this.gitHubInstaller = new GitHubInstaller(options)
    this.storage = new ExtensionStorage(options)
  }

  // ===========================================================================
  // Registry Operations
  // ===========================================================================

  /**
   * Gets all available extensions from the registry
   */
  async getAvailableExtensions(): Promise<ExtensionListItem[]> {
    return this.registryClient.getAvailableExtensions()
  }

  /**
   * Searches for extensions in the registry
   */
  async searchExtensions(options?: SearchOptions): Promise<ExtensionListItem[]> {
    return this.registryClient.searchExtensions(options)
  }

  /**
   * Gets detailed information about an extension
   */
  async getExtensionDetails(extensionId: string): Promise<ExtensionDetails> {
    return this.registryClient.getExtensionDetails(extensionId)
  }

  // ===========================================================================
  // Installation Operations
  // ===========================================================================

  /**
   * Installs an extension from the registry
   */
  async install(extensionId: string, version?: string): Promise<InstallResult> {
    try {
      // Check if already installed
      if (this.storage.isInstalled(extensionId)) {
        const installed = this.storage.getInstalledExtension(extensionId)
        if (installed && !version) {
          return {
            success: false,
            extensionId,
            version: installed.version,
            error: `Extension "${extensionId}" is already installed (v${installed.version}). Use update() to update.`,
          }
        }
      }

      // Get extension details from registry
      const details = await this.registryClient.getExtensionDetails(extensionId)

      // Find the requested version (or latest)
      const versionEntry = version
        ? details.versions.find((v) => v.version === version)
        : details.versions[0] // First entry is latest

      if (!versionEntry) {
        return {
          success: false,
          extensionId,
          version: version || 'latest',
          error: `Version "${version}" not found for extension "${extensionId}"`,
        }
      }

      // Download and install
      const result = await this.gitHubInstaller.installFromVersion(extensionId, versionEntry)

      if (!result.success) {
        return {
          success: false,
          extensionId,
          version: versionEntry.version,
          error: result.error,
        }
      }

      // Register the installation
      this.storage.registerExtension(extensionId, versionEntry.version)

      return {
        success: true,
        extensionId,
        version: versionEntry.version,
        path: result.path,
        hashWarning: result.hashWarning,
      }
    } catch (error) {
      return {
        success: false,
        extensionId,
        version: version || 'unknown',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Uninstalls an extension
   */
  async uninstall(extensionId: string, deleteData?: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.storage.isInstalled(extensionId)) {
        return {
          success: false,
          error: `Extension "${extensionId}" is not installed`,
        }
      }

      // Delete extension data from database if requested
      if (deleteData && this.options.onDeleteExtensionData) {
        try {
          await this.options.onDeleteExtensionData(extensionId)
        } catch (error) {
          this.options.logger?.warn('Failed to delete extension data', {
            extensionId,
            error: error instanceof Error ? error.message : String(error),
          })
          // Continue with uninstall even if data deletion fails
        }
      }

      // Remove files
      this.storage.removeExtensionFiles(extensionId)

      // Unregister
      this.storage.unregisterExtension(extensionId)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Updates an extension to the latest version (or specific version)
   */
  async update(extensionId: string, version?: string): Promise<InstallResult> {
    const installed = this.storage.getInstalledExtension(extensionId)

    if (!installed) {
      return {
        success: false,
        extensionId,
        version: version || 'unknown',
        error: `Extension "${extensionId}" is not installed`,
      }
    }

    // Get extension details
    const details = await this.registryClient.getExtensionDetails(extensionId)

    // Find target version
    const targetVersion = version
      ? details.versions.find((v) => v.version === version)
      : details.versions[0]

    if (!targetVersion) {
      return {
        success: false,
        extensionId,
        version: version || 'latest',
        error: `Version "${version}" not found`,
      }
    }

    // Check if already on this version
    if (installed.version === targetVersion.version) {
      return {
        success: true,
        extensionId,
        version: targetVersion.version,
        path: installed.path,
      }
    }

    // Download and install
    const result = await this.gitHubInstaller.installFromVersion(extensionId, targetVersion)

    if (!result.success) {
      return {
        success: false,
        extensionId,
        version: targetVersion.version,
        error: result.error,
      }
    }

    // Update registration
    this.storage.registerExtension(extensionId, targetVersion.version)

    return {
      success: true,
      extensionId,
      version: targetVersion.version,
      path: result.path,
      hashWarning: result.hashWarning,
    }
  }

  // ===========================================================================
  // Local Operations
  // ===========================================================================

  /**
   * Gets all installed extensions
   */
  getInstalledExtensions(): InstalledExtension[] {
    return this.storage.getInstalledExtensions()
  }

  /**
   * Gets all installed extensions with manifest validation status
   */
  getInstalledExtensionsWithValidation(): InstalledExtensionInfo[] {
    return this.storage.getInstalledExtensionsWithValidation()
  }

  /**
   * Gets a specific installed extension
   */
  getInstalledExtension(extensionId: string): InstalledExtension | undefined {
    return this.storage.getInstalledExtension(extensionId)
  }

  /**
   * Checks if an extension is installed
   */
  isInstalled(extensionId: string): boolean {
    return this.storage.isInstalled(extensionId)
  }

  /**
   * Enables an extension
   */
  enable(extensionId: string): void {
    this.storage.setEnabled(extensionId, true)
  }

  /**
   * Disables an extension
   */
  disable(extensionId: string): void {
    this.storage.setEnabled(extensionId, false)
  }

  /**
   * Gets the manifest for an installed extension
   */
  getManifest(extensionId: string): ExtensionManifest | null {
    return this.storage.loadManifest(extensionId)
  }

  /**
   * Gets all enabled extensions with their manifests
   */
  getEnabledExtensions(): Array<{ installed: InstalledExtension; manifest: ExtensionManifest }> {
    return this.storage.getEnabledExtensions()
  }

  /**
   * Gets the path to an extension
   */
  getExtensionPath(extensionId: string): string {
    return this.storage.getExtensionPath(extensionId)
  }

  // ===========================================================================
  // Update Checking
  // ===========================================================================

  /**
   * Checks for available updates
   */
  async checkForUpdates(): Promise<
    Array<{ extensionId: string; currentVersion: string; latestVersion: string }>
  > {
    const installed = this.storage.getInstalledExtensions()
    const updates: Array<{ extensionId: string; currentVersion: string; latestVersion: string }> =
      []

    for (const ext of installed) {
      try {
        const exists = await this.registryClient.extensionExists(ext.id)
        if (!exists) continue

        const details = await this.registryClient.getExtensionDetails(ext.id)
        const latestVersion = details.versions[0]?.version

        if (latestVersion && latestVersion !== ext.version) {
          updates.push({
            extensionId: ext.id,
            currentVersion: ext.version,
            latestVersion,
          })
        }
      } catch {
        // Ignore errors for individual extensions
      }
    }

    return updates
  }

  /**
   * Refreshes the registry cache
   */
  async refreshRegistry(): Promise<void> {
    this.registryClient.clearCache()
    await this.registryClient.getRegistry(true)
  }
}
