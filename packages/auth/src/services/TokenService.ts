import * as jose from 'jose'
import { createHash, randomBytes } from 'node:crypto'
import { AUTH_CONFIG } from '../constants.js'
import type { UserRole } from '../types/user.js'
import type { AccessTokenPayload, RefreshTokenPayload, TokenPair } from '../types/session.js'

/**
 * Token configuration options
 */
export interface TokenConfig {
  accessTokenSecret: string
  refreshTokenSecret: string
  accessTokenExpiry?: string
  refreshTokenExpiry?: string
  issuer?: string
}

/**
 * Generated refresh token data
 */
export interface GeneratedRefreshToken {
  token: string
  tokenId: string
  tokenHash: string
  expiresAt: Date
}

/**
 * Service for JWT token generation and verification
 */
export class TokenService {
  private accessSecret: Uint8Array
  private refreshSecret: Uint8Array
  private accessTokenExpiry: string
  private refreshTokenExpiry: string
  private issuer: string

  constructor(config: TokenConfig) {
    this.accessSecret = new TextEncoder().encode(config.accessTokenSecret)
    this.refreshSecret = new TextEncoder().encode(config.refreshTokenSecret)
    this.accessTokenExpiry = config.accessTokenExpiry ?? AUTH_CONFIG.ACCESS_TOKEN_EXPIRY
    this.refreshTokenExpiry = config.refreshTokenExpiry ?? AUTH_CONFIG.REFRESH_TOKEN_EXPIRY
    this.issuer = config.issuer ?? AUTH_CONFIG.TOKEN_ISSUER
  }

  /**
   * Generate an access token (short-lived, for API calls)
   */
  async generateAccessToken(user: {
    id: string
    username: string
    role: UserRole
  }): Promise<string> {
    return new jose.SignJWT({
      username: user.username,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(this.issuer)
      .setIssuedAt()
      .setExpirationTime(this.accessTokenExpiry)
      .sign(this.accessSecret)
  }

  /**
   * Generate a refresh token (long-lived, for getting new access tokens)
   */
  async generateRefreshToken(userId: string): Promise<GeneratedRefreshToken> {
    const tokenId = randomBytes(16).toString('hex')

    const token = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(tokenId)
      .setIssuer(this.issuer)
      .setIssuedAt()
      .setExpirationTime(this.refreshTokenExpiry)
      .sign(this.refreshSecret)

    // Hash for storage (never store the actual token)
    const tokenHash = this.hashToken(token)

    // Calculate expiry
    const expiryMs = this.parseExpiry(this.refreshTokenExpiry)
    const expiresAt = new Date(Date.now() + expiryMs)

    return { token, tokenId, tokenHash, expiresAt }
  }

  /**
   * Generate a token pair (access + refresh)
   */
  async generateTokenPair(user: {
    id: string
    username: string
    role: UserRole
  }): Promise<{ tokens: TokenPair; refreshTokenData: GeneratedRefreshToken }> {
    const [accessToken, refreshTokenData] = await Promise.all([
      this.generateAccessToken(user),
      this.generateRefreshToken(user.id),
    ])

    return {
      tokens: {
        accessToken,
        refreshToken: refreshTokenData.token,
      },
      refreshTokenData,
    }
  }

  /**
   * Verify an access token
   */
  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jose.jwtVerify(token, this.accessSecret, {
      issuer: this.issuer,
    })

    return payload as unknown as AccessTokenPayload
  }

  /**
   * Verify a refresh token
   */
  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    const { payload } = await jose.jwtVerify(token, this.refreshSecret, {
      issuer: this.issuer,
    })

    return payload as unknown as RefreshTokenPayload
  }

  /**
   * Hash a token for storage lookup
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Generate a random secret for token signing
   */
  static generateSecret(): string {
    return randomBytes(32).toString('hex')
  }

  /**
   * Parse expiry string to milliseconds
   */
  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/)
    if (!match) throw new Error(`Invalid expiry format: ${expiry}`)

    const value = parseInt(match[1]!, 10)
    const unit = match[2]

    switch (unit) {
      case 's':
        return value * 1000
      case 'm':
        return value * 60 * 1000
      case 'h':
        return value * 60 * 60 * 1000
      case 'd':
        return value * 24 * 60 * 60 * 1000
      default:
        throw new Error(`Unknown unit: ${unit}`)
    }
  }
}
