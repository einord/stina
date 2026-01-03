/**
 * Settings store interface - platform neutral
 * Implementations are provided by adapters
 */
export interface SettingsStore {
  /**
   * Get a value from a namespace
   */
  get<T>(namespace: string, key: string): T | undefined

  /**
   * Set a value in a namespace
   */
  set(namespace: string, key: string, value: unknown): void

  /**
   * Get all values in a namespace
   */
  getNamespace(namespace: string): Record<string, unknown>

  /**
   * Delete a key from a namespace
   */
  delete(namespace: string, key: string): void

  /**
   * Persist changes to disk
   */
  flush(): Promise<void>
}

/**
 * App settings namespace (read-only for extensions)
 */
export const APP_NAMESPACE = 'app'

/**
 * Extensions settings namespace prefix
 */
export const EXTENSIONS_NAMESPACE = 'extensions'
