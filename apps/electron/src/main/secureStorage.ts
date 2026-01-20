import { safeStorage, app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TOKEN_FILE_NAME = 'auth-tokens.encrypted'

/**
 * Stored token data structure
 */
interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** Timestamp when stored */
  storedAt: number
}

/**
 * Token pair returned to the renderer
 */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Get the path to the token file
 */
function getTokenFilePath(): string {
  return path.join(app.getPath('userData'), TOKEN_FILE_NAME)
}

/**
 * Secure storage for authentication tokens.
 * Uses Electron's safeStorage API to encrypt tokens at rest.
 *
 * On macOS, this uses the Keychain.
 * On Windows, this uses DPAPI.
 * On Linux, this uses the Secret Service API or libsecret.
 */
export const secureStorage = {
  /**
   * Check if encryption is available on this system.
   */
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  },

  /**
   * Store tokens securely.
   *
   * @param tokens - The access and refresh tokens to store
   * @throws If encryption is not available
   */
  async setTokens(tokens: TokenPair): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system')
    }

    const data: StoredTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      storedAt: Date.now(),
    }

    const jsonString = JSON.stringify(data)
    const encrypted = safeStorage.encryptString(jsonString)

    const filePath = getTokenFilePath()
    await fs.promises.writeFile(filePath, encrypted)
  },

  /**
   * Retrieve stored tokens.
   *
   * @returns The stored tokens, or null if none exist or decryption fails
   */
  async getTokens(): Promise<TokenPair | null> {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }

    const filePath = getTokenFilePath()

    // Check if file exists
    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
    } catch {
      return null
    }

    try {
      const encrypted = await fs.promises.readFile(filePath)
      const decrypted = safeStorage.decryptString(encrypted)
      const data: StoredTokens = JSON.parse(decrypted)

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      }
    } catch (error) {
      // Log decryption errors for debugging - could indicate security issues or corrupted storage
      console.error('Failed to decrypt or parse stored tokens:', error)
      // Decryption failed or invalid data - clear the file
      await this.clearTokens()
      return null
    }
  },

  /**
   * Clear stored tokens.
   */
  async clearTokens(): Promise<void> {
    const filePath = getTokenFilePath()

    try {
      await fs.promises.unlink(filePath)
    } catch {
      // File doesn't exist, that's fine
    }
  },

  /**
   * Check if tokens are stored.
   */
  async hasTokens(): Promise<boolean> {
    const filePath = getTokenFilePath()

    try {
      await fs.promises.access(filePath, fs.constants.F_OK)
      return true
    } catch {
      return false
    }
  },
}
