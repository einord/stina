/**
 * GitHub Installer
 *
 * Downloads and installs extensions from GitHub releases.
 * v2: Includes hash verification for verified extensions.
 */

import { createWriteStream, existsSync, mkdirSync, createReadStream, readFileSync } from 'fs'
import type { WriteStream } from 'fs'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { join, dirname, resolve as resolvePath, normalize } from 'path'
import { createHash } from 'crypto'
import type { VersionInfo, ExtensionInstallerOptions, Platform, ManifestValidationResult } from './types.js'
import type { ExtensionManifest } from '@stina/extension-api'
import { validateManifestFile } from './validateManifestFile.js'

export interface InstallFromVersionResult {
  success: boolean
  path?: string
  error?: string
  hashWarning?: string
  actualHash?: string
}

export interface InstallFromLocalZipResult {
  success: boolean
  extensionId?: string
  version?: string
  extractedPath?: string
  error?: string
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

      // Validate manifest after extraction
      const manifestValidation = this.validateExtensionManifest(extensionPath)
      if (!manifestValidation.valid) {
        // Remove the extracted files since manifest is invalid
        const { rmSync } = await import('fs')
        rmSync(extensionPath, { recursive: true, force: true })

        this.logger?.error('Extension manifest validation failed', {
          extensionId,
          errors: manifestValidation.errors,
        })

        return {
          success: false,
          error: `Invalid manifest: ${manifestValidation.errors.join('; ')}`,
        }
      }

      // Log warnings if any
      if (manifestValidation.warnings.length > 0) {
        this.logger?.warn('Extension manifest has warnings', {
          extensionId,
          warnings: manifestValidation.warnings,
        })
      }

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
   * Includes protection against ZIP bombs by limiting extracted size
   */
  async extractZip(zipPath: string, destPath: string): Promise<void> {
    // Maximum extracted size: 500 MB (protects against ZIP bombs)
    const MAX_EXTRACTED_SIZE = 500 * 1024 * 1024

    // Dynamically import unzipper to handle the case where it's not installed
    try {
      const unzipper = await import('unzipper')

      let totalExtractedSize = 0

      await new Promise<void>((resolve, reject) => {
        createReadStream(zipPath)
          .pipe(unzipper.Parse())
          .on('entry', (entry: { path: string; type: string; vars: { uncompressedSize: number }; autodrain: () => void; pipe: (dest: WriteStream) => void }) => {
            const fileName = entry.path
            const type = entry.type // 'Directory' or 'File'
            const size = entry.vars.uncompressedSize

            // Validate path to prevent directory traversal attacks
            const fullPath = join(destPath, fileName)
            const normalizedPath = normalize(fullPath)
            const resolvedPath = resolvePath(normalizedPath)
            const resolvedDestPath = resolvePath(destPath)

            if (!resolvedPath.startsWith(resolvedDestPath + '/') && resolvedPath !== resolvedDestPath) {
              entry.autodrain()
              reject(
                new Error(
                  `ZIP extraction aborted: path traversal detected in "${fileName}"`,
                ),
              )
              return
            }

            // Check if adding this file would exceed the limit
            totalExtractedSize += size
            if (totalExtractedSize > MAX_EXTRACTED_SIZE) {
              entry.autodrain()
              reject(
                new Error(
                  `ZIP extraction aborted: total extracted size exceeds ${MAX_EXTRACTED_SIZE / (1024 * 1024)}MB. This may be a ZIP bomb.`,
                ),
              )
              return
            }

            if (type === 'Directory') {
              entry.autodrain()
            } else {
              // Ensure parent directory exists
              const parentDir = dirname(fullPath)
              if (!existsSync(parentDir)) {
                mkdirSync(parentDir, { recursive: true })
              }
              entry.pipe(createWriteStream(fullPath))
            }
          })
          .on('close', resolve)
          .on('error', reject)
      })
    } catch (error) {
      // If it's our ZIP bomb error, re-throw it
      if (error instanceof Error && error.message.includes('ZIP bomb')) {
        throw error
      }

      // Fallback: try using native unzip command
      const { execSync } = await import('child_process')
      try {
        mkdirSync(destPath, { recursive: true })
        execSync(`unzip -o "${zipPath}" -d "${destPath}"`, { stdio: 'pipe' })

        // Check extracted size after unzip
        const sizeOutput = execSync(`du -sb "${destPath}"`, { encoding: 'utf-8' })
        const extractedSize = parseInt(sizeOutput.split('\t')[0] || '0')

        if (extractedSize > MAX_EXTRACTED_SIZE) {
          // Clean up
          const { rmSync } = await import('fs')
          rmSync(destPath, { recursive: true, force: true })
          throw new Error(
            `ZIP extraction aborted: total extracted size exceeds ${MAX_EXTRACTED_SIZE / (1024 * 1024)}MB. This may be a ZIP bomb.`,
          )
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('ZIP bomb')) {
          throw err
        }
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

  /**
   * Validates the extension manifest in the extracted directory
   */
  validateExtensionManifest(extensionPath: string): ManifestValidationResult {
    const manifestPath = join(extensionPath, 'manifest.json')
    return validateManifestFile(manifestPath)
  }

  /**
   * Installs an extension from a local ZIP stream.
   * Saves the stream to a temp file, extracts it, and validates the manifest.
   *
   * @param zipStream - The readable stream containing the ZIP file
   * @param tempPath - Path to save the temporary ZIP file
   * @returns Result containing extensionId and path to extracted files on success
   */
  async installFromLocalZip(zipStream: Readable, tempPath: string): Promise<InstallFromLocalZipResult> {
    const tempExtractPath = `${tempPath}-extracted`

    try {
      // Ensure parent directory exists
      const parentDir = join(tempPath, '..')
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true })
      }

      // Save stream to temp file
      this.logger?.debug('Saving ZIP stream to temp file', { tempPath })
      const writeStream = createWriteStream(tempPath)
      await pipeline(zipStream, writeStream)

      // Create temp extraction directory
      if (!existsSync(tempExtractPath)) {
        mkdirSync(tempExtractPath, { recursive: true })
      }

      // Extract the zip file to temp directory
      this.logger?.debug('Extracting ZIP to temp directory', { tempExtractPath })
      await this.extractZip(tempPath, tempExtractPath)

      // Validate manifest
      const manifestValidation = this.validateExtensionManifest(tempExtractPath)
      if (!manifestValidation.valid) {
        // Clean up
        const { rmSync, unlinkSync } = await import('fs')
        rmSync(tempExtractPath, { recursive: true, force: true })
        unlinkSync(tempPath)

        this.logger?.error('Local extension manifest validation failed', {
          errors: manifestValidation.errors,
        })

        return {
          success: false,
          error: `Invalid manifest: ${manifestValidation.errors.join('; ')}`,
        }
      }

      // Read manifest to get extensionId and version
      const manifestPath = join(tempExtractPath, 'manifest.json')
      const manifestContent = readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestContent) as ExtensionManifest

      // Clean up temp zip file (keep extracted files)
      const { unlinkSync } = await import('fs')
      unlinkSync(tempPath)

      this.logger?.info('Local extension extracted and validated', {
        extensionId: manifest.id,
        version: manifest.version,
      })

      return {
        success: true,
        extensionId: manifest.id,
        version: manifest.version,
        extractedPath: tempExtractPath,
      }
    } catch (error) {
      // Clean up on error
      try {
        const { unlinkSync, rmSync, existsSync: exists } = await import('fs')
        if (exists(tempPath)) unlinkSync(tempPath)
        if (exists(tempExtractPath)) rmSync(tempExtractPath, { recursive: true, force: true })
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger?.error('Failed to install local extension from ZIP', { error: errorMessage })

      return { success: false, error: errorMessage }
    }
  }
}
