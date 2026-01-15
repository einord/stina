import { eq, and, isNull, gt, lt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AuthDb, UserRole } from './schema.js'
import { invitations } from './schema.js'

/**
 * Invitation data
 */
export interface Invitation {
  id: string
  token: string
  username: string
  role: UserRole
  createdBy: string
  expiresAt: Date
  createdAt: Date
  usedAt: Date | null
  usedBy: string | null
}

/**
 * Input for creating an invitation
 */
export interface CreateInvitationInput {
  username: string
  role?: UserRole
  createdBy: string
  expiresAt?: Date
}

/**
 * Repository for invitation data access
 */
export class InvitationRepository {
  constructor(private db: AuthDb) {}

  /**
   * Create a new invitation
   */
  async create(input: CreateInvitationInput): Promise<Invitation> {
    const now = new Date()
    const id = nanoid()
    const token = nanoid(32) // Longer token for security

    // Default expiration: 7 days
    const expiresAt = input.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    await this.db.insert(invitations).values({
      id,
      token,
      username: input.username,
      role: input.role ?? 'user',
      createdBy: input.createdBy,
      expiresAt,
      createdAt: now,
      usedAt: null,
      usedBy: null,
    })

    const invitation = await this.getById(id)
    if (!invitation) {
      throw new Error('Failed to create invitation')
    }
    return invitation
  }

  /**
   * Get invitation by ID
   */
  async getById(id: string): Promise<Invitation | null> {
    const result = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.id, id))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToInvitation(row)
  }

  /**
   * Get invitation by token
   */
  async getByToken(token: string): Promise<Invitation | null> {
    const result = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToInvitation(row)
  }

  /**
   * Get valid (not used, not expired) invitation by token
   */
  async getValidByToken(token: string): Promise<Invitation | null> {
    const now = new Date()

    const result = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, token),
          isNull(invitations.usedAt),
          gt(invitations.expiresAt, now)
        )
      )
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToInvitation(row)
  }

  /**
   * Get all invitations created by a user
   */
  async getByCreator(createdBy: string): Promise<Invitation[]> {
    const result = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.createdBy, createdBy))

    return result.map(this.mapToInvitation)
  }

  /**
   * Get all pending (not used) invitations
   */
  async getPending(): Promise<Invitation[]> {
    const now = new Date()

    const result = await this.db
      .select()
      .from(invitations)
      .where(and(isNull(invitations.usedAt), gt(invitations.expiresAt, now)))

    return result.map(this.mapToInvitation)
  }

  /**
   * Mark invitation as used
   */
  async markUsed(id: string, usedBy: string): Promise<void> {
    const now = new Date()

    await this.db
      .update(invitations)
      .set({
        usedAt: now,
        usedBy,
      })
      .where(eq(invitations.id, id))
  }

  /**
   * Delete an invitation
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(invitations).where(eq(invitations.id, id))
  }

  /**
   * Delete expired invitations (cleanup)
   */
  async cleanup(): Promise<number> {
    const now = new Date()

    const result = await this.db
      .delete(invitations)
      .where(
        and(
          isNull(invitations.usedAt),
          // Expired
          lt(invitations.expiresAt, now)
        )
      )

    return result.changes
  }

  /**
   * Map database row to Invitation type
   */
  private mapToInvitation(row: {
    id: string
    token: string
    username: string
    role: UserRole
    createdBy: string
    expiresAt: Date
    createdAt: Date
    usedAt: Date | null
    usedBy: string | null
  }): Invitation {
    return {
      id: row.id,
      token: row.token,
      username: row.username,
      role: row.role,
      createdBy: row.createdBy,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      usedAt: row.usedAt,
      usedBy: row.usedBy,
    }
  }
}
