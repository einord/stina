import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export type UserRole = 'admin' | 'user'

/**
 * Users table - stores all user accounts
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    displayName: text('display_name'),
    role: text('role').$type<UserRole>().notNull().default('user'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  },
  (table) => ({
    usernameIdx: index('idx_users_username').on(table.username),
  })
)

/**
 * Passkey credentials table - WebAuthn authenticator data
 */
export const passkeyCredentials = sqliteTable(
  'passkey_credentials',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Base64URL encoded credential ID */
    credentialId: text('credential_id').notNull().unique(),
    /** Base64URL encoded COSE public key */
    publicKey: text('public_key').notNull(),
    /** Signature counter for replay attack prevention */
    counter: integer('counter').notNull().default(0),
    /** JSON array of transport hints */
    transports: text('transports', { mode: 'json' }).$type<string[]>(),
    /** Device type: "singleDevice" or "multiDevice" */
    deviceType: text('device_type'),
    /** Whether credential is backed up (synced) */
    backedUp: integer('backed_up', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  },
  (table) => ({
    userIdx: index('idx_passkey_user').on(table.userId),
    credentialIdx: index('idx_passkey_credential').on(table.credentialId),
  })
)

/**
 * Refresh tokens table - long-lived tokens for session renewal
 */
export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 hash of the token */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    /** JSON object with device information */
    deviceInfo: text('device_info', { mode: 'json' }).$type<{
      userAgent?: string
      ip?: string
    }>(),
  },
  (table) => ({
    userIdx: index('idx_refresh_tokens_user').on(table.userId),
    expiresIdx: index('idx_refresh_tokens_expires').on(table.expiresAt),
  })
)

/**
 * Auth configuration table - server-wide settings like rpId
 */
export const authConfig = sqliteTable('auth_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/**
 * User invitations table - for admin to invite new users
 */
export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    /** Unique token for the invitation link */
    token: text('token').notNull().unique(),
    /** Pre-assigned username for the invitee */
    username: text('username').notNull(),
    /** Pre-assigned role for the invitee */
    role: text('role').$type<UserRole>().notNull().default('user'),
    /** Admin who created the invitation */
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    /** When the invitation was used */
    usedAt: integer('used_at', { mode: 'timestamp' }),
    /** User ID of who used the invitation */
    usedBy: text('used_by').references(() => users.id),
  },
  (table) => ({
    tokenIdx: index('idx_invitations_token').on(table.token),
    createdByIdx: index('idx_invitations_created_by').on(table.createdBy),
  })
)

/**
 * Combined auth schema for Drizzle
 */
export const authSchema = {
  users,
  passkeyCredentials,
  refreshTokens,
  authConfig,
  invitations,
}

/**
 * Auth database type with schema
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Auth DB is initialized in adapters-node with a different schema object
export type AuthDb = BetterSQLite3Database<any>
