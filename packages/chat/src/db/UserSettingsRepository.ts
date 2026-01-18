import { userSettings } from './schema.js'
import type { ChatDb } from './schema.js'
import { eq, and, isNull } from 'drizzle-orm'
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
 * Database repository for user-specific settings.
 * Uses key-value storage for flexible settings management with user isolation.
 */
export class UserSettingsRepository {
  /**
   * Creates a new UserSettingsRepository instance.
   * @param db - The database connection
   * @param userId - The user ID to scope settings to (required for multi-user support)
   */
  constructor(
    private db: ChatDb,
    private userId: string
  ) {}

  /**
   * Get all settings for the current user.
   * Returns default values for any missing settings.
   */
  async get(): Promise<AppSettingsDTO> {
    const results = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, this.userId))

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
   * Get a specific setting value for the current user.
   */
  async getValue<K extends keyof AppSettingsDTO>(key: K): Promise<AppSettingsDTO[K]> {
    const results = await this.db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
      .limit(1)

    if (results[0]) {
      return results[0].value as AppSettingsDTO[K]
    }

    return DEFAULT_SETTINGS[key]
  }

  /**
   * Update settings for the current user (partial update).
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
        await this.db
          .delete(userSettings)
          .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
      } else if (value !== undefined) {
        // Check if the setting already exists for this user
        const existing = await this.db
          .select()
          .from(userSettings)
          .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
          .limit(1)

        if (existing.length > 0) {
          // Update existing setting
          await this.db
            .update(userSettings)
            .set({
              value,
              updatedAt: now,
            })
            .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
        } else {
          // Insert new setting
          await this.db.insert(userSettings).values({
            key,
            value,
            updatedAt: now,
            userId: this.userId,
          })
        }
      }
    }

    return this.get()
  }

  /**
   * Set a specific setting value for the current user.
   */
  async setValue<K extends keyof AppSettingsDTO>(key: K, value: AppSettingsDTO[K]): Promise<void> {
    const now = new Date()

    // Check if the setting already exists for this user
    const existing = await this.db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
      .limit(1)

    if (existing.length > 0) {
      // Update existing setting
      await this.db
        .update(userSettings)
        .set({
          value,
          updatedAt: now,
        })
        .where(and(eq(userSettings.key, key), eq(userSettings.userId, this.userId)))
    } else {
      // Insert new setting
      await this.db.insert(userSettings).values({
        key,
        value,
        updatedAt: now,
        userId: this.userId,
      })
    }
  }

  /**
   * Reset all settings to defaults for the current user.
   */
  async resetToDefaults(): Promise<AppSettingsDTO> {
    await this.db.delete(userSettings).where(eq(userSettings.userId, this.userId))
    return DEFAULT_SETTINGS
  }

  /**
   * Migrate settings from NULL userId to a specific user.
   * This is useful for migrating existing settings during user setup.
   */
  async migrateFromNullUser(): Promise<void> {
    const now = new Date()

    // Get all settings with NULL userId
    const nullSettings = await this.db
      .select()
      .from(userSettings)
      .where(isNull(userSettings.userId))

    // For each NULL setting, check if the user already has this setting
    for (const setting of nullSettings) {
      const existing = await this.db
        .select()
        .from(userSettings)
        .where(and(eq(userSettings.key, setting.key), eq(userSettings.userId, this.userId)))
        .limit(1)

      if (existing.length === 0) {
        // User doesn't have this setting, create it with their userId
        await this.db.insert(userSettings).values({
          key: setting.key,
          value: setting.value,
          updatedAt: now,
          userId: this.userId,
        })
      }
    }
  }
}
