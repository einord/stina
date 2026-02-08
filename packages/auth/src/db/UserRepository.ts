import { eq, count as drizzleCount } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { AuthDb, UserRole } from './schema.js'
import { users } from './schema.js'
import type { User, CreateUserInput, UpdateUserInput } from '../types/user.js'

/**
 * Repository for user data access
 */
export class UserRepository {
  constructor(private db: AuthDb) {}

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<User> {
    const now = new Date()
    const id = input.id ?? nanoid()

    await this.db.insert(users).values({
      id,
      username: input.username,
      displayName: input.displayName ?? null,
      role: input.role ?? 'user',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    })

    const user = await this.getById(id)
    if (!user) {
      throw new Error('Failed to create user')
    }
    return user
  }

  /**
   * Get user by ID
   */
  async getById(id: string): Promise<User | null> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToUser(row)
  }

  /**
   * Get user by username
   */
  async getByUsername(username: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)

    const row = result[0]
    if (!row) return null

    return this.mapToUser(row)
  }

  /**
   * List all users
   */
  async list(): Promise<User[]> {
    const result = await this.db.select().from(users)
    return result.map(this.mapToUser)
  }

  /**
   * Update a user
   */
  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const now = new Date()

    await this.db
      .update(users)
      .set({
        displayName: input.displayName,
        role: input.role,
        updatedAt: now,
      })
      .where(eq(users.id, id))

    return this.getById(id)
  }

  /**
   * Update user's last login time
   */
  async updateLastLogin(id: string): Promise<void> {
    const now = new Date()

    await this.db
      .update(users)
      .set({
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, id))
  }

  /**
   * Delete a user
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(users).where(eq(users.id, id))
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    const result = await this.db.select({ count: drizzleCount() }).from(users)
    return result[0]?.count ?? 0
  }

  /**
   * Check if any users exist
   */
  async isEmpty(): Promise<boolean> {
    const count = await this.count()
    return count === 0
  }

  /**
   * Map database row to User type
   */
  private mapToUser(row: {
    id: string
    username: string
    displayName: string | null
    role: UserRole
    createdAt: Date
    updatedAt: Date
    lastLoginAt: Date | null
  }): User {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt,
    }
  }
}
