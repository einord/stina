/**
 * Authentication configuration constants
 */
export const AUTH_CONFIG = {
  /** Access token expires after 15 minutes */
  ACCESS_TOKEN_EXPIRY: '15m',

  /** Refresh token expires after 7 days */
  REFRESH_TOKEN_EXPIRY: '7d',

  /** Issuer for JWT tokens */
  TOKEN_ISSUER: 'stina',

  /** Default user ID for local mode (Electron/TUI) */
  DEFAULT_USER_ID: 'local-default-user',

  /** Default username for local mode */
  DEFAULT_USERNAME: 'local',

  /** WebAuthn Relying Party name */
  RP_NAME: 'Stina',
} as const

/**
 * Auth configuration keys stored in database
 */
export const AUTH_CONFIG_KEYS = {
  /** Relying Party ID (domain) */
  RP_ID: 'rp_id',

  /** Relying Party origin (full URL) */
  RP_ORIGIN: 'rp_origin',

  /** Whether setup has been completed */
  SETUP_COMPLETED: 'setup_completed',

  /** Access token secret */
  ACCESS_TOKEN_SECRET: 'access_token_secret',

  /** Refresh token secret */
  REFRESH_TOKEN_SECRET: 'refresh_token_secret',
} as const
