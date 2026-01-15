import { eq } from 'drizzle-orm'
import type { AuthDb } from './schema.js'
import { authConfig } from './schema.js'
import { AUTH_CONFIG_KEYS } from '../constants.js'

/**
 * Repository for auth configuration data access
 */
export class AuthConfigRepository {
  constructor(private db: AuthDb) {}

  /**
   * Get a configuration value
   */
  async get(key: string): Promise<string | null> {
    const result = await this.db
      .select()
      .from(authConfig)
      .where(eq(authConfig.key, key))
      .limit(1)

    return result[0]?.value ?? null
  }

  /**
   * Set a configuration value
   */
  async set(key: string, value: string): Promise<void> {
    const now = new Date()

    const existing = await this.get(key)

    if (existing !== null) {
      await this.db.update(authConfig).set({ value }).where(eq(authConfig.key, key))
    } else {
      await this.db.insert(authConfig).values({
        key,
        value,
        createdAt: now,
      })
    }
  }

  /**
   * Delete a configuration value
   */
  async delete(key: string): Promise<void> {
    await this.db.delete(authConfig).where(eq(authConfig.key, key))
  }

  /**
   * Get all configuration values
   */
  async getAll(): Promise<Map<string, string>> {
    const result = await this.db.select().from(authConfig)
    return new Map(result.map((row) => [row.key, row.value]))
  }

  // Convenience methods for specific config values

  /**
   * Get the Relying Party ID (domain)
   */
  async getRpId(): Promise<string | null> {
    return this.get(AUTH_CONFIG_KEYS.RP_ID)
  }

  /**
   * Set the Relying Party ID (domain)
   */
  async setRpId(rpId: string): Promise<void> {
    return this.set(AUTH_CONFIG_KEYS.RP_ID, rpId)
  }

  /**
   * Get the Relying Party origin
   */
  async getRpOrigin(): Promise<string | null> {
    return this.get(AUTH_CONFIG_KEYS.RP_ORIGIN)
  }

  /**
   * Set the Relying Party origin
   */
  async setRpOrigin(rpOrigin: string): Promise<void> {
    return this.set(AUTH_CONFIG_KEYS.RP_ORIGIN, rpOrigin)
  }

  /**
   * Check if setup has been completed
   */
  async isSetupCompleted(): Promise<boolean> {
    const value = await this.get(AUTH_CONFIG_KEYS.SETUP_COMPLETED)
    return value === 'true'
  }

  /**
   * Mark setup as completed
   */
  async markSetupCompleted(): Promise<void> {
    return this.set(AUTH_CONFIG_KEYS.SETUP_COMPLETED, 'true')
  }

  /**
   * Get the access token secret
   */
  async getAccessTokenSecret(): Promise<string | null> {
    return this.get(AUTH_CONFIG_KEYS.ACCESS_TOKEN_SECRET)
  }

  /**
   * Set the access token secret
   */
  async setAccessTokenSecret(secret: string): Promise<void> {
    return this.set(AUTH_CONFIG_KEYS.ACCESS_TOKEN_SECRET, secret)
  }

  /**
   * Get the refresh token secret
   */
  async getRefreshTokenSecret(): Promise<string | null> {
    return this.get(AUTH_CONFIG_KEYS.REFRESH_TOKEN_SECRET)
  }

  /**
   * Set the refresh token secret
   */
  async setRefreshTokenSecret(secret: string): Promise<void> {
    return this.set(AUTH_CONFIG_KEYS.REFRESH_TOKEN_SECRET, secret)
  }
}
