/**
 * Authentication types for WebAuthn/passkey authentication
 */

/**
 * User information
 */
export interface User {
  id: string
  username: string
  displayName?: string
  role: 'admin' | 'user'
  createdAt: Date
  lastLoginAt?: Date
}

/**
 * JWT token pair for authentication
 */
export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Authentication state managed by useAuth composable
 */
export interface AuthState {
  user: User | null
  tokens: TokenPair | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * Device information sent during login
 */
export interface DeviceInfo {
  userAgent?: string
  platform?: string
  language?: string
}

/**
 * Invitation for new users
 */
export interface Invitation {
  id: string
  token: string
  username: string
  role: 'admin' | 'user'
  createdBy: string
  expiresAt: Date
  createdAt: Date
  usedAt?: Date
  usedBy?: string
}

/**
 * Setup status response
 */
export interface SetupStatus {
  isFirstUser: boolean
  setupCompleted: boolean
}

/**
 * Registration options response
 */
export interface RegistrationOptionsResponse {
  options: unknown
  isFirstUser: boolean
}

/**
 * Auth response with user and tokens
 */
export interface AuthResponse {
  user: User
  tokens: TokenPair
}

/**
 * Invitation validation response
 */
export interface InvitationValidation {
  valid: boolean
  username?: string
  role?: string
}
