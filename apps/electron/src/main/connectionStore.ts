import Store from 'electron-store'
import type { ConnectionConfig, ConnectionMode } from '@stina/core'
import { DEFAULT_CONNECTION_CONFIG } from '@stina/core'

interface StoreSchema {
  connection: ConnectionConfig
}

const store = new Store<StoreSchema>({
  name: 'stina-config',
  defaults: {
    connection: DEFAULT_CONNECTION_CONFIG,
  },
})

/**
 * Get the current connection configuration.
 */
export function getConnectionConfig(): ConnectionConfig {
  return store.get('connection')
}

/**
 * Set the connection configuration.
 */
export function setConnectionConfig(config: ConnectionConfig): void {
  store.set('connection', config)
}

/**
 * Check if the connection has been configured (not 'unconfigured').
 */
export function isConfigured(): boolean {
  return store.get('connection.mode') !== 'unconfigured'
}

/**
 * Get the current connection mode.
 */
export function getConnectionMode(): ConnectionMode {
  return store.get('connection.mode')
}

/**
 * Get the remote URL if configured.
 */
export function getRemoteUrl(): string | undefined {
  return store.get('connection.remoteUrl')
}
