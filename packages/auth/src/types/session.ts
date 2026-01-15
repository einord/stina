import type { UserRole } from './user.js'

/**
 * Access token JWT payload
 */
export interface AccessTokenPayload {
  /** User ID */
  sub: string
  /** Username */
  username: string
  /** User role */
  role: UserRole
  /** Issued at timestamp */
  iat: number
  /** Expiration timestamp */
  exp: number
}

/**
 * Refresh token JWT payload
 */
export interface RefreshTokenPayload {
  /** User ID */
  sub: string
  /** Token ID (for revocation) */
  jti: string
  /** Issued at timestamp */
  iat: number
  /** Expiration timestamp */
  exp: number
}

/**
 * Token pair returned after authentication
 */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Refresh token data stored in database
 */
export interface RefreshTokenData {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
  deviceInfo: DeviceInfo | null
}

/**
 * Device information for session tracking
 */
export interface DeviceInfo {
  userAgent?: string
  ip?: string
}
