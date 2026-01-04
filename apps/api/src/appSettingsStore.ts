import type { SettingsStore } from '@stina/core'
import { APP_NAMESPACE } from '@stina/core'
import type { AppSettingsDTO } from '@stina/shared'
import type { DB } from '@stina/adapters-node'
import { AppSettingsRepository } from '@stina/chat/db'

/**
 * Lightweight in-memory settings store backed by AppSettingsRepository.
 * Used to supply app settings to chat orchestration.
 */
class AppSettingsStore implements SettingsStore {
  private data: Record<string, Record<string, unknown>> = {}

  constructor(settings: AppSettingsDTO) {
    this.data[APP_NAMESPACE] = { ...settings }
  }

  /**
   * Replace all app settings in memory.
   */
  update(settings: AppSettingsDTO): void {
    this.data[APP_NAMESPACE] = { ...settings }
  }

  get<T>(namespace: string, key: string): T | undefined {
    return this.data[namespace]?.[key] as T | undefined
  }

  set(namespace: string, key: string, value: unknown): void {
    if (!this.data[namespace]) {
      this.data[namespace] = {}
    }
    this.data[namespace][key] = value
  }

  getNamespace(namespace: string): Record<string, unknown> {
    return this.data[namespace] ? { ...this.data[namespace] } : {}
  }

  delete(namespace: string, key: string): void {
    if (this.data[namespace]) {
      delete this.data[namespace][key]
    }
  }

  async flush(): Promise<void> {
    return
  }
}

let settingsStore: AppSettingsStore | null = null

export async function initAppSettingsStore(db: DB): Promise<SettingsStore> {
  const repo = new AppSettingsRepository(db)
  const settings = await repo.get()
  settingsStore = new AppSettingsStore(settings)
  return settingsStore
}

/**
 * Get the current in-memory settings store (if initialized).
 */
export function getAppSettingsStore(): SettingsStore | undefined {
  return settingsStore ?? undefined
}

/**
 * Update the in-memory settings store after app settings change.
 */
export function updateAppSettingsStore(settings: AppSettingsDTO): void {
  settingsStore?.update(settings)
}
