import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { appSettings } from './schema.js'
import { eq } from 'drizzle-orm'
import type { AppSettingsDTO } from '@stina/shared'

/**
 * Default application settings
 */
const DEFAULT_SETTINGS: AppSettingsDTO = {
  language: 'en',
  timezone: 'UTC',
  theme: 'dark',
  notificationSound: 'default',
  firstName: undefined,
  nickname: undefined,
  debugMode: false,
  personalityPreset: 'friendly',
  customPersonalityPrompt: undefined,
}

/**
 * Database repository for application settings.
 * Uses key-value storage for flexible settings management.
 */
export class AppSettingsRepository {
  constructor(private db: BetterSQLite3Database<any>) {}

  /**
   * Get all application settings
   * Returns default values for any missing settings
   */
  async get(): Promise<AppSettingsDTO> {
    const results = await this.db.select().from(appSettings)

    const settings = { ...DEFAULT_SETTINGS }

    for (const row of results) {
      const key = row.key as keyof AppSettingsDTO
      if (key in settings) {
        ;(settings as any)[key] = row.value
      }
    }

    return settings
  }

  /**
   * Get a specific setting value
   */
  async getValue<K extends keyof AppSettingsDTO>(key: K): Promise<AppSettingsDTO[K]> {
    const results = await this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1)

    if (results[0]) {
      return results[0].value as AppSettingsDTO[K]
    }

    return DEFAULT_SETTINGS[key]
  }

  /**
   * Update application settings (partial update)
   */
  async update(updates: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> {
    const now = new Date()

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        await this.db
          .insert(appSettings)
          .values({
            key,
            value: value as any,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value: value as any,
              updatedAt: now,
            },
          })
      }
    }

    return this.get()
  }

  /**
   * Set a specific setting value
   */
  async setValue<K extends keyof AppSettingsDTO>(key: K, value: AppSettingsDTO[K]): Promise<void> {
    const now = new Date()

    await this.db
      .insert(appSettings)
      .values({
        key,
        value: value as any,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: value as any,
          updatedAt: now,
        },
      })
  }

  /**
   * Reset all settings to defaults
   */
  async resetToDefaults(): Promise<AppSettingsDTO> {
    await this.db.delete(appSettings)
    return DEFAULT_SETTINGS
  }
}
