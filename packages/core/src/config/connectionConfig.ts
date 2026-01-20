/**
 * Connection mode for the application.
 * - 'unconfigured': First launch, user needs to choose
 * - 'local': Running locally with IPC-based communication
 * - 'remote': Connected to a remote Stina API server
 */
export type ConnectionMode = 'unconfigured' | 'local' | 'remote'

/**
 * Configuration for the application's connection mode.
 * This is stored globally (not per-user) as it determines how the app connects.
 */
export interface ConnectionConfig {
  /** The current connection mode */
  mode: ConnectionMode
  /** URL of the remote API server (only used when mode is 'remote') */
  remoteUrl?: string
}

/**
 * Default configuration for new installations.
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  mode: 'unconfigured',
}
