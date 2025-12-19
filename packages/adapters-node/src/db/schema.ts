import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Core app metadata table
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/**
 * Migrations tracking table
 */
export const migrations = sqliteTable('_migrations', {
  name: text('name').primaryKey(),
  appliedAt: text('applied_at').notNull(),
})
