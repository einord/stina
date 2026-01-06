/**
 * GitHub Installer
 *
 * Downloads and installs extensions from GitHub releases.
 * v2: Includes hash verification for verified extensions.
 */

import { createWriteStream, existsSync, mkdirSync, createReadStream } from 'fs'
import { pipeline } from 'stream/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import type { VersionInfo, ExtensionInstallerOptions, Platform } from './types.js'

export interface InstallFromVersionResult {
  success: boolean
  path?: string
  error?: string
  hashWarning?: string
  actualHash?: string
}

export class GitHubInstaller {
  private readonly extensionsPath: string
  private readonly stinaVersion: string
  private readonly platform: Platform
  private readonly logger: ExtensionInstallerOptions['logger']

  constructor(options: ExtensionInstallerOptions) {
    this.extensionsPath = options.extensionsPath
    this.stinaVersion = options.stinaVersion
    this.platform = options.platform
    this.logger = options.logger
  }

  /**
   * Downloads and extracts an extension from a version entry
   */
  async installFromVersion(
    extensionId: string,
    version: VersionInfo
  ): Promise<InstallFromVersionResult> {
    // Check platform compatibility if platforms are specified
    if (version.platforms && version.platforms.length > 0 && !version.platforms.includes(this.platform)) {
      return {
        success: false,
        error: `Extension does not support platform "${this.platform}"`,
      }
    }

    // Check Stina version compatibility if minStinaVersion is specified
    if (version.minStinaVersion && !this.isVersionCompatible(version.minStinaVersion, this.stinaVersion)) {
      return {
        success: false,
        error: `Extension requires Stina ${version.minStinaVersion} or higher (current: ${this.stinaVersion})`,
      }
    }

    const extensionPath = join(this.extensionsPath, extensionId)
    const tempZipPath = join(this.extensionsPath, `.${extensionId}-temp.zip`)

    try {
      // Ensure extensions directory exists
      if (!existsSync(this.extensionsPath)) {
        mkdirSync(this.extensionsPath, { recursive: true })
      }

      // Download the zip file
      this.logger?.info('Downloading extension', { extensionId, url: version.downloadUrl })
      await this.downloadFile(version.downloadUrl, tempZipPath)

      // Calculate hash
      const actualHash = await this.calculateSha256(tempZipPath)
      let hashWarning: string | undefined

      // Verify hash if this is a verified version
      if (version.sha256) {
        if (actualHash !== version.sha256) {
          // Hash mismatch for verified version - this is a security concern!
          this.logger?.warn('Hash mismatch for verified extension', {
            extensionId,
            expected: version.sha256,
            actual: actualHash,
          })
          hashWarning = `Security warning: Downloaded file hash (${actualHash.slice(0, 16)}...) does not match verified hash (${version.sha256.slice(0, 16)}...). The extension may have been modified.`
        } else {
          this.logger?.debug('Hash verified', { extensionId, hash: actualHash.slice(0, 16) })
        }
      } else if (version.isVerified) {
        // Extension is marked as verified but no hash for this version
        hashWarning = 'This version has not been verified. Install at your own risk.'
      }

      // Remove existing extension directory if it exists
      if (existsSync(extensionPath)) {
        const { rmSync } = await import('fs')
        rmSync(extensionPath, { recursive: true, force: true })
      }

      // Extract the zip file
      this.logger?.debug('Extracting extension', { extensionId, path: extensionPath })
      await this.extractZip(tempZipPath, extensionPath)

      // Clean up temp file
      const { unlinkSync } = await import('fs')
      unlinkSync(tempZipPath)

      this.logger?.info('Extension installed', { extensionId, version: version.version })

      return {
        success: true,
        path: extensionPath,
        hashWarning,
        actualHash,
      }
    } catch (error) {
      // Clean up on error
      try {
        const { unlinkSync, existsSync: exists } = await import('fs')
        if (exists(tempZipPath)) unlinkSync(tempZipPath)
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger?.error('Failed to install extension', { extensionId, error: errorMessage })

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Downloads a file from a URL
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/octet-stream',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const fileStream = createWriteStream(destPath)

    // Convert web stream to node stream using Readable.fromWeb
    const { Readable } = await import('stream')
    const readable = Readable.fromWeb(response.body as import('stream/web').ReadableStream)

    await pipeline(readable, fileStream)
  }

  /**
   * Calculates SHA256 hash of a file
   */
  async calculateSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)

      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Extracts a zip file to a directory
   */
  private async extractZip(zipPath: string, destPath: string): Promise<void> {
    // Dynamically import unzipper to handle the case where it's not installed
    try {
      const unzipper = await import('unzipper')

      await new Promise<void>((resolve, reject) => {
        createReadStream(zipPath)
          .pipe(unzipper.Extract({ path: destPath }))
          .on('close', resolve)
          .on('error', reject)
      })
    } catch {
      // Fallback: try using native unzip command
      const { execSync } = await import('child_process')
      try {
        mkdirSync(destPath, { recursive: true })
        execSync(`unzip -o "${zipPath}" -d "${destPath}"`, { stdio: 'pipe' })
      } catch {
        throw new Error(
          `Failed to extract zip. Install 'unzipper' package or ensure 'unzip' command is available.`
        )
      }
    }
  }

  /**
   * Checks if the current version is compatible with the minimum required version
   */
  private isVersionCompatible(minVersion: string, currentVersion: string): boolean {
    const min = this.parseVersion(minVersion)
    const current = this.parseVersion(currentVersion)

    if (current.major > min.major) return true
    if (current.major < min.major) return false

    if (current.minor > min.minor) return true
    if (current.minor < min.minor) return false

    return current.patch >= min.patch
  }

  /**
   * Parses a semver version string
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number } {
    const [major, minor, patch] = version.split('.').map(Number)
    return { major: major || 0, minor: minor || 0, patch: patch || 0 }
  }
}
