import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AuthDb } from './schema.js'
import { passkeyCredentials } from './schema.js'

/**
 * Passkey credential data
 */
export interface PasskeyCredential {
  id: string
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports: string[] | null
  deviceType: string | null
  backedUp: boolean
  createdAt: Date
  lastUsedAt: Date | null
}

/**
 * Input for creating a passkey credential
 */
export interface CreatePasskeyCredentialInput {
  userId: string
  credentialId: string
  publicKey: string
  counter: number
  transports?: string[]
  deviceType?: string
  backedUp?: boolean
}

/**
 * Repository for passkey credential data access
 */
export class PasskeyCredentialRepository {
  constructor(private db: AuthDb) {}

  /**
   * Create a new passkey credential
   */
  async create(input: CreatePasskeyCredentialInput): Promise<PasskeyCredential> {
    const now = new Date()
    const id = nanoid()

    await this.db.insert(passkeyCredentials).values({
      id,
      userId: input.userId,
      credentialId: input.credentialId,
      publicKey: input.publicKey,
      counter: input.counter,
      transports: input.transports ?? null,
      deviceType: input.deviceType ?? null,
      backedUp: input.backedUp ?? false,
      createdAt: now,
      lastUsedAt: null,
    })

    const credential = await this.getById(id)
    if (!credential) {
      throw new Error('Failed to create passkey credential')
    }
    return credential
  }

  /**
   * Get passkey credential by ID
   */
  async getById(id: string): Promise<PasskeyCredential | null> {
    const result = await this.db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.id, id))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToCredential(row)
  }

  /**
   * Get passkey credential by credential ID
   */
  async getByCredentialId(credentialId: string): Promise<PasskeyCredential | null> {
    const result = await this.db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, credentialId))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToCredential(row)
  }

  /**
   * Get all passkey credentials for a user
   */
  async getByUserId(userId: string): Promise<PasskeyCredential[]> {
    const result = await this.db
      .select()
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userId))

    return result.map(this.mapToCredential)
  }

  /**
   * Update the counter after authentication
   */
  async updateCounter(id: string, counter: number): Promise<void> {
    const now = new Date()

    await this.db
      .update(passkeyCredentials)
      .set({
        counter,
        lastUsedAt: now,
      })
      .where(eq(passkeyCredentials.id, id))
  }

  /**
   * Delete a passkey credential
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(passkeyCredentials).where(eq(passkeyCredentials.id, id))
  }

  /**
   * Delete all passkey credentials for a user
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.db.delete(passkeyCredentials).where(eq(passkeyCredentials.userId, userId))
  }

  /**
   * Map database row to PasskeyCredential type
   */
  private mapToCredential(row: {
    id: string
    userId: string
    credentialId: string
    publicKey: string
    counter: number
    transports: string[] | null
    deviceType: string | null
    backedUp: boolean
    createdAt: Date
    lastUsedAt: Date | null
  }): PasskeyCredential {
    return {
      id: row.id,
      userId: row.userId,
      credentialId: row.credentialId,
      publicKey: row.publicKey,
      counter: row.counter,
      transports: row.transports,
      deviceType: row.deviceType,
      backedUp: row.backedUp,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    }
  }
}
