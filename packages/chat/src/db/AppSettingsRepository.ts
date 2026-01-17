import { appSettings } from './schema.js'
import type { ChatDb } from './schema.js'
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

function setSetting<K extends keyof AppSettingsDTO>(
  settings: AppSettingsDTO,
  key: K,
  value: AppSettingsDTO[K]
): void {
  settings[key] = value
}

/**
 * Database repository for application settings.
 * Uses key-value storage for flexible settings management.
 */
export class AppSettingsRepository {
  constructor(private db: ChatDb) {}

  /**
   * Get all application settings
   * Returns default values for any missing settings
   */
  async get(): Promise<AppSettingsDTO> {
    const results = await this.db.select().from(appSettings)

    const settings: AppSettingsDTO = { ...DEFAULT_SETTINGS }

    for (const row of results) {
      const key = row.key as keyof AppSettingsDTO
      if (key in settings) {
        setSetting(settings, key, row.value as AppSettingsDTO[typeof key])
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
   * Update application settings (partial update).
   * Pass null to clear a setting (removes it from database, returning to default).
   * Pass undefined to skip updating a setting.
   */
  async update(updates: Partial<AppSettingsDTO>): Promise<AppSettingsDTO> {
    const now = new Date()

    const entries = Object.entries(updates) as Array<
      [keyof AppSettingsDTO, AppSettingsDTO[keyof AppSettingsDTO]]
    >

    for (const [key, value] of entries) {
      if (value === null) {
        // null means "clear this setting" - delete from database to return to default
        await this.db.delete(appSettings).where(eq(appSettings.key, key))
      } else if (value !== undefined) {
        await this.db
          .insert(appSettings)
          .values({
            key,
            value,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: {
              value,
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
        value,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value,
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
