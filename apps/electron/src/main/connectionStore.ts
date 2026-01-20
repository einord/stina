import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ConnectionConfig, ConnectionMode } from '@stina/core'
import { DEFAULT_CONNECTION_CONFIG } from '@stina/core'

interface StoreData {
  connection: ConnectionConfig
}

/**
 * Legacy store data structure (for migration).
 */
interface LegacyStoreData {
  connection: {
    mode: 'unconfigured' | 'local' | 'remote'
    remoteUrl?: string
  }
}

const CONFIG_FILE_NAME = 'stina-config.json'

/**
 * Get the path to the config file.
 */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME)
}

/**
 * Migrate legacy remoteUrl to webUrl.
 * If remoteUrl ends with /api, strips it to get the web URL.
 *
 * @param legacyData - The legacy store data
 * @returns Migrated store data
 */
function migrateFromLegacy(legacyData: LegacyStoreData): StoreData {
  const { connection } = legacyData

  // If there's no remoteUrl, no migration needed
  if (!connection.remoteUrl) {
    return {
      connection: {
        mode: connection.mode,
      },
    }
  }

  // Convert remoteUrl to webUrl
  // If remoteUrl ends with /api, strip it to get the web URL
  let webUrl = connection.remoteUrl
  if (webUrl.endsWith('/api')) {
    webUrl = webUrl.slice(0, -4)
  }
  // Also handle trailing slash
  if (webUrl.endsWith('/')) {
    webUrl = webUrl.slice(0, -1)
  }

  return {
    connection: {
      mode: connection.mode,
      webUrl,
    },
  }
}

/**
 * Read the store data from disk.
 * Handles migration from legacy remoteUrl to webUrl format.
 */
function readStore(): StoreData {
  const configPath = getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      const parsed = JSON.parse(data)

      // Check if this is legacy format (has remoteUrl instead of webUrl)
      if (parsed.connection?.remoteUrl !== undefined) {
        const migrated = migrateFromLegacy(parsed as LegacyStoreData)
        // Persist the migrated data
        writeStore(migrated)
        return migrated
      }

      return parsed as StoreData
    }
  } catch {
    // If file is corrupted or unreadable, return defaults
  }
  return { connection: DEFAULT_CONNECTION_CONFIG }
}

/**
 * Write the store data to disk.
 */
function writeStore(data: StoreData): void {
  const configPath = getConfigPath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Get the current connection configuration.
 */
export function getConnectionConfig(): ConnectionConfig {
  return readStore().connection
}

/**
 * Set the connection configuration.
 */
export function setConnectionConfig(config: ConnectionConfig): void {
  const data = readStore()
  data.connection = config
  writeStore(data)
}

/**
 * Check if the connection has been configured (not 'unconfigured').
 */
export function isConfigured(): boolean {
  return readStore().connection.mode !== 'unconfigured'
}

/**
 * Get the current connection mode.
 */
export function getConnectionMode(): ConnectionMode {
  return readStore().connection.mode
}

/**
 * Get the web URL if configured.
 */
export function getWebUrl(): string | undefined {
  return readStore().connection.webUrl
}
