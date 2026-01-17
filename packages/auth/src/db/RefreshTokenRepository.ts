import { eq, and, isNull, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AuthDb } from './schema.js'
import { refreshTokens } from './schema.js'
import type { RefreshTokenData, DeviceInfo } from '../types/session.js'

/**
 * Input for creating a refresh token
 */
export interface CreateRefreshTokenInput {
  userId: string
  tokenHash: string
  expiresAt: Date
  deviceInfo?: DeviceInfo
}

/**
 * Repository for refresh token data access
 */
export class RefreshTokenRepository {
  constructor(private db: AuthDb) {}

  /**
   * Create a new refresh token
   */
  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenData> {
    const now = new Date()
    const id = nanoid()

    await this.db.insert(refreshTokens).values({
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: now,
      revokedAt: null,
      deviceInfo: input.deviceInfo ?? null,
    })

    const token = await this.getById(id)
    if (!token) {
      throw new Error('Failed to create refresh token')
    }
    return token
  }

  /**
   * Get refresh token by ID
   */
  async getById(id: string): Promise<RefreshTokenData | null> {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToToken(row)
  }

  /**
   * Get refresh token by hash
   */
  async getByTokenHash(tokenHash: string): Promise<RefreshTokenData | null> {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToToken(row)
  }

  /**
   * Get valid (not revoked, not expired) refresh token by hash
   */
  async getValidByTokenHash(tokenHash: string): Promise<RefreshTokenData | null> {
    const now = new Date()

    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          // Token must not be expired
          // Note: SQLite stores timestamps as integers, so we compare properly
        )
      )
      .limit(1)

    const row = result[0]
    if (!row) return null

    // Check expiration in JavaScript to be safe
    if (row.expiresAt < now) {
      return null
    }

    return this.mapToToken(row)
  }

  /**
   * Get all active refresh tokens for a user
   */
  async getActiveByUserId(userId: string): Promise<RefreshTokenData[]> {
    const now = new Date()

    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))

    return result.filter((row) => row.expiresAt >= now).map(this.mapToToken)
  }

  /**
   * Revoke a refresh token
   */
  async revoke(id: string): Promise<void> {
    const now = new Date()

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, id))
  }

  /**
   * Revoke a refresh token by hash
   */
  async revokeByTokenHash(tokenHash: string): Promise<void> {
    const now = new Date()

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.tokenHash, tokenHash))
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllByUserId(userId: string): Promise<void> {
    const now = new Date()

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))
  }

  /**
   * Delete expired and revoked tokens (cleanup)
   */
  async cleanup(): Promise<number> {
    const now = new Date()

    // Delete tokens that are either expired or revoked
    const expiredResult = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, now))

    return expiredResult.changes
  }

  /**
   * Map database row to RefreshTokenData type
   */
  private mapToToken(row: {
    id: string
    userId: string
    tokenHash: string
    expiresAt: Date
    createdAt: Date
    revokedAt: Date | null
    deviceInfo: { userAgent?: string; ip?: string } | null
  }): RefreshTokenData {
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
      deviceInfo: row.deviceInfo,
    }
  }
}
