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
  /** URL of the web application (only used when mode is 'remote') */
  webUrl?: string
}

/**
 * Get the API URL from the web URL.
 * API is served from the same domain with /api prefix.
 *
 * @param webUrl - The base URL of the web application
 * @returns The API URL with /api suffix
 */
export function getApiUrl(webUrl: string): string {
  const url = webUrl.endsWith('/') ? webUrl.slice(0, -1) : webUrl
  return `${url}/api`
}

/**
 * Default configuration for new installations.
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  mode: 'unconfigured',
}
