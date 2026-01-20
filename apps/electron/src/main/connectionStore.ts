import { app } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ConnectionConfig, ConnectionMode } from '@stina/core'
import { DEFAULT_CONNECTION_CONFIG } from '@stina/core'

interface StoreData {
  connection: ConnectionConfig
}

const CONFIG_FILE_NAME = 'stina-config.json'

/**
 * Get the path to the config file.
 */
function getConfigPath(): string {
  return path.join(app.getPath('userData'), CONFIG_FILE_NAME)
}

/**
 * Read the store data from disk.
 */
function readStore(): StoreData {
  const configPath = getConfigPath()
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(data) as StoreData
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
 * Get the remote URL if configured.
 */
export function getRemoteUrl(): string | undefined {
  return readStore().connection.remoteUrl
}
