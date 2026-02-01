# @stina/extension-installer

Discovery, installation, and management of Stina extensions from the registry and GitHub.

## Overview

The `@stina/extension-installer` package handles the complete extension lifecycle:

- **Discovery** - Browse and search the extension registry
- **Installation** - Download and install extensions from GitHub releases
- **Management** - Enable, disable, update, and uninstall extensions
- **Security** - Hash verification for verified extensions, platform compatibility checks

Extensions are distributed through GitHub releases and indexed in a central registry.

## Key Exports

```typescript
import {
  ExtensionInstaller,
  RegistryClient,
  GitHubInstaller,
  GitHubService,
  ExtensionStorage,
  validateManifestFile,
} from '@stina/extension-installer'

import type {
  Registry,
  RegistryEntry,
  ExtensionListItem,
  ExtensionDetails,
  VersionInfo,
  InstalledExtension,
  InstallResult,
  SearchOptions,
  ExtensionInstallerOptions,
} from '@stina/extension-installer'
```

## Extension Installation Flow

```
Registry (registry.json)
         |
         v
    RegistryClient
    (fetch extension metadata)
         |
         v
    GitHubService
    (fetch releases from GitHub API)
         |
         v
    GitHubInstaller
    (download zip, verify hash, extract)
         |
         v
    ExtensionStorage
    (register in installed-extensions.json)
```

## Usage Examples

### Initialize the Installer

```typescript
import { ExtensionInstaller } from '@stina/extension-installer'

const installer = new ExtensionInstaller({
  extensionsPath: '/path/to/extensions',
  stinaVersion: '0.20.0',
  platform: 'electron',
  registryUrl: 'https://raw.githubusercontent.com/einord/stina-extensions-registry/main',
  logger: console,
})
```

### Browse Extensions

```typescript
// Get all available extensions
const extensions = await installer.getAvailableExtensions()

// Search with filters
const results = await installer.searchExtensions({
  query: 'openai',
  category: 'ai-provider',
  verified: true,
})

// Get detailed info for a specific extension
const details = await installer.getExtensionDetails('my-extension')
```

### Install and Update

```typescript
// Install latest version
const result = await installer.install('my-extension')
if (result.success) {
  console.log(`Installed at ${result.path}`)
}

// Install specific version
await installer.install('my-extension', '1.2.0')

// Update to latest
await installer.update('my-extension')

// Check for updates
const updates = await installer.checkForUpdates()
// Returns: [{ extensionId, currentVersion, latestVersion }]
```

### Manage Installed Extensions

```typescript
// List installed extensions
const installed = installer.getInstalledExtensions()

// Enable/disable
installer.enable('my-extension')
installer.disable('my-extension')

// Uninstall (optionally delete stored data)
await installer.uninstall('my-extension', true)

// Get manifest
const manifest = installer.getManifest('my-extension')
```

## Key Components

### ExtensionInstaller

Main orchestrator class that coordinates registry access, downloads, and local storage. Provides the high-level API for all extension operations.

### RegistryClient

Fetches and caches the extension registry. Enriches registry entries with data from GitHub (name, description, latest version). Supports search by query, category, and verified status.

### GitHubService

Interacts with GitHub API to fetch releases and manifests. Parses repository URLs and extracts release assets. Caches release data for 5 minutes.

### GitHubInstaller

Downloads extension zip files from GitHub releases. Handles extraction, hash verification, and manifest validation. Checks platform and Stina version compatibility.

### ExtensionStorage

Manages local extension storage in the file system. Tracks installed extensions in `installed-extensions.json`. Handles enable/disable state and manifest loading.

## Security Features

### Hash Verification

Verified extensions include SHA-256 hashes in the registry. During installation, the downloaded file hash is compared against the expected value:

```typescript
interface VerifiedVersion {
  version: string
  sha256: string
  verifiedAt: string
}
```

If the hash mismatches, installation continues but returns a `hashWarning` in the result.

### Platform Compatibility

Extensions can specify supported platforms. Installation fails if the current platform is not supported:

```typescript
interface VersionInfo {
  platforms?: Platform[] // 'web' | 'electron' | 'tui'
  minStinaVersion?: string
}
```

### Version Checking

Extensions can require a minimum Stina version. Semver comparison ensures compatibility before installation.

### Blocked Extensions

The registry can block extensions for security or policy reasons:

```typescript
interface RegistryEntry {
  blocked: boolean
  blockedReason?: string
}
```

Blocked extensions are filtered from search results and cannot be installed.

## Related Documentation

- [Extension System](../architecture/extensions.md) - How extensions work in Stina
- [Extension API](./extension-api.md) - Types and runtime for building extensions
- [Extension Host](./extension-host.md) - Worker-based extension execution
