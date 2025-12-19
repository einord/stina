import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { SettingsStore } from '@stina/core'
import { AppError, ErrorCode } from '@stina/core'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Encrypted settings store implementation
 */
export class EncryptedSettingsStore implements SettingsStore {
  private data: Record<string, Record<string, unknown>> = {}
  private loaded = false
  private flushTimeout: NodeJS.Timeout | null = null
  private readonly flushDelay = 1000 // Debounce delay in ms

  constructor(
    private readonly filePath: string,
    private readonly encryptionKey: Buffer
  ) {}

  private ensureLoaded(): void {
    if (this.loaded) return

    if (fs.existsSync(this.filePath)) {
      try {
        const encrypted = fs.readFileSync(this.filePath)
        const decrypted = this.decrypt(encrypted)
        this.data = JSON.parse(decrypted)
      } catch (error) {
        throw new AppError(
          ErrorCode.CONFIG_ENCRYPTION_FAILED,
          'Failed to decrypt config file',
          { path: this.filePath },
          error instanceof Error ? error : undefined
        )
      }
    }

    this.loaded = true
  }

  private encrypt(text: string): Buffer {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv)

    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted])
  }

  private decrypt(data: Buffer): string {
    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

    const decipher = crypto.createDecipheriv(ALGORITHM, this.encryptionKey, iv)
    decipher.setAuthTag(authTag)

    return decipher.update(encrypted) + decipher.final('utf8')
  }

  get<T>(namespace: string, key: string): T | undefined {
    this.ensureLoaded()
    return this.data[namespace]?.[key] as T | undefined
  }

  set(namespace: string, key: string, value: unknown): void {
    this.ensureLoaded()

    if (!this.data[namespace]) {
      this.data[namespace] = {}
    }
    this.data[namespace][key] = value

    this.scheduleFlush()
  }

  getNamespace(namespace: string): Record<string, unknown> {
    this.ensureLoaded()
    return this.data[namespace] ? { ...this.data[namespace] } : {}
  }

  delete(namespace: string, key: string): void {
    this.ensureLoaded()

    if (this.data[namespace]) {
      delete this.data[namespace][key]
      this.scheduleFlush()
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout)
    }
    this.flushTimeout = setTimeout(() => {
      this.flush().catch(console.error)
    }, this.flushDelay)
  }

  async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout)
      this.flushTimeout = null
    }

    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const encrypted = this.encrypt(JSON.stringify(this.data))
    fs.writeFileSync(this.filePath, encrypted)
  }
}

/**
 * Derive a 256-bit key from a secret
 */
export function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'stina-salt', 32)
}
