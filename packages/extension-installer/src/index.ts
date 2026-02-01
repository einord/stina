/**
 * @stina/extension-installer
 *
 * Handles discovery, installation, and management of Stina extensions.
 *
 * Features:
 * - Search and browse the extension registry
 * - Install extensions from GitHub releases
 * - Manage installed extensions (enable/disable/uninstall)
 * - Check for updates
 */

// Main installer class
export { ExtensionInstaller } from './ExtensionInstaller.js'

// Component classes
export { RegistryClient } from './RegistryClient.js'
export { GitHubInstaller } from './GitHubInstaller.js'
export { GitHubService } from './GitHubService.js'
export { ExtensionStorage } from './ExtensionStorage.js'
export { validateManifestFile } from './validateManifestFile.js'

// Types
export type {
  Registry,
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  VersionInfo,
  VerifiedVersion,
  GitHubRelease,
  GitHubAsset,
  ExtensionCategory,
  Platform,
  InstalledExtension,
  InstalledExtensionInfo,
  ManifestValidationResult,
  InstallResult,
  LinkLocalResult,
  UnlinkLocalResult,
  SearchOptions,
  ExtensionInstallerOptions,
} from './types.js'
