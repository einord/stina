import { getApiUrl } from '@stina/core'
import { secureStorage, type TokenPair } from './secureStorage.js'

/**
 * Buffer time before token expiry to trigger refresh (5 minutes).
 */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000

/**
 * Parse the expiry time from a JWT token.
 *
 * @param token - The JWT access token
 * @returns The expiry timestamp in milliseconds, or null if parsing fails
 */
export function parseJwtExpiry(token: string): number | null {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    // Decode the payload (second part)
    const payload = parts[1]
    if (!payload) {
      return null
    }

    // Base64url decode
    const decoded = Buffer.from(payload, 'base64url').toString('utf-8')
    const data = JSON.parse(decoded) as { exp?: number }

    if (typeof data.exp !== 'number') {
      return null
    }

    // Convert from seconds to milliseconds
    return data.exp * 1000
  } catch {
    return null
  }
}

/**
 * Check if a token is expired or will expire within the buffer time.
 *
 * @param token - The JWT access token
 * @param bufferMs - Buffer time before expiry to consider token as expired
 * @returns True if token is expired or will expire within buffer time
 */
export function isTokenExpired(token: string, bufferMs: number = EXPIRY_BUFFER_MS): boolean {
  const expiry = parseJwtExpiry(token)
  if (expiry === null) {
    // If we can't parse expiry, assume token is valid
    return false
  }

  return Date.now() >= expiry - bufferMs
}

/**
 * Refresh tokens using the refresh token.
 *
 * @param apiUrl - The API URL
 * @param refreshToken - The refresh token
 * @returns New token pair, or null if refresh fails
 */
export async function refreshTokens(
  apiUrl: string,
  refreshToken: string
): Promise<TokenPair | null> {
  try {
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!response.ok) {
      return null
    }

    const tokens = (await response.json()) as TokenPair
    return tokens
  } catch {
    return null
  }
}

/**
 * Get valid tokens, refreshing if necessary.
 * This is the main function to call when you need tokens for an API request.
 *
 * @param webUrl - The web application URL
 * @returns Valid token pair, or null if no tokens or refresh fails
 */
export async function getValidTokens(webUrl: string): Promise<TokenPair | null> {
  const tokens = await secureStorage.getTokens()
  if (!tokens) {
    return null
  }

  // Check if access token is still valid
  if (!isTokenExpired(tokens.accessToken)) {
    return tokens
  }

  // Access token expired or expiring soon, try to refresh
  const apiUrl = getApiUrl(webUrl)
  const newTokens = await refreshTokens(apiUrl, tokens.refreshToken)

  if (!newTokens) {
    // Refresh failed, clear stored tokens
    await secureStorage.clearTokens()
    return null
  }

  // Store new tokens
  await secureStorage.setTokens(newTokens)
  return newTokens
}

/**
 * Token manager singleton for managing token lifecycle.
 */
export const tokenManager = {
  parseJwtExpiry,
  isTokenExpired,
  refreshTokens,
  getValidTokens,
}
