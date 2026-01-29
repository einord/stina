/**
 * Query Parser
 *
 * Converts MongoDB-style query objects to SQL WHERE clauses.
 */

import type { Query, QueryOptions } from '@stina/extension-api'

export interface ParsedQuery {
  /** SQL WHERE clause (without "WHERE" keyword) */
  whereClause: string
  /** Parameter values for the query */
  params: unknown[]
  /** ORDER BY clause (without "ORDER BY" keyword) */
  orderByClause?: string
  /** LIMIT value */
  limit?: number
  /** OFFSET value */
  offset?: number
}

/**
 * Parses a Query object into SQL components.
 * Uses json_extract for querying JSON data.
 *
 * @param query The query object
 * @param options Query options (sort, limit, offset)
 * @returns Parsed query with SQL components
 */
export function parseQuery(query?: Query, options?: QueryOptions): ParsedQuery {
  const conditions: string[] = []
  const params: unknown[] = []

  if (query) {
    for (const [field, value] of Object.entries(query)) {
      // Validate field path to prevent SQL injection
      validateFieldPath(field)

      // Handle operator objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const ops = value as Record<string, unknown>

        if ('$gt' in ops) {
          conditions.push(`json_extract(data, '$.${field}') > ?`)
          params.push(ops['$gt'])
        }
        if ('$gte' in ops) {
          conditions.push(`json_extract(data, '$.${field}') >= ?`)
          params.push(ops['$gte'])
        }
        if ('$lt' in ops) {
          conditions.push(`json_extract(data, '$.${field}') < ?`)
          params.push(ops['$lt'])
        }
        if ('$lte' in ops) {
          conditions.push(`json_extract(data, '$.${field}') <= ?`)
          params.push(ops['$lte'])
        }
        if ('$ne' in ops) {
          conditions.push(`json_extract(data, '$.${field}') != ?`)
          params.push(ops['$ne'])
        }
        if ('$in' in ops) {
          const arr = ops['$in'] as unknown[]
          const placeholders = arr.map(() => '?').join(', ')
          conditions.push(`json_extract(data, '$.${field}') IN (${placeholders})`)
          params.push(...arr)
        }
        if ('$contains' in ops) {
          conditions.push(`LOWER(json_extract(data, '$.${field}')) LIKE ?`)
          params.push(`%${String(ops['$contains']).toLowerCase()}%`)
        }
      } else {
        // Exact match
        conditions.push(`json_extract(data, '$.${field}') = ?`)
        params.push(value)
      }
    }
  }

  // Build ORDER BY clause
  let orderByClause: string | undefined
  if (options?.sort) {
    const orderParts = Object.entries(options.sort).map(([field, direction]) => {
      // Validate sort field path to prevent SQL injection
      validateFieldPath(field)
      return `json_extract(data, '$.${field}') ${direction.toUpperCase()}`
    })
    orderByClause = orderParts.join(', ')
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
    params,
    orderByClause,
    limit: options?.limit,
    offset: options?.offset,
  }
}

/**
 * Builds a complete SQL query with WHERE, ORDER BY, LIMIT, OFFSET
 */
export function buildSelectQuery(
  tableName: string,
  parsed: ParsedQuery,
  countOnly: boolean = false
): string {
  const select = countOnly ? 'COUNT(*) as count' : 'id, data, created_at, updated_at'
  let sql = `SELECT ${select} FROM ${tableName} WHERE ${parsed.whereClause}`

  if (!countOnly && parsed.orderByClause) {
    sql += ` ORDER BY ${parsed.orderByClause}`
  }

  if (!countOnly && parsed.limit !== undefined) {
    sql += ` LIMIT ${parsed.limit}`
  }

  if (!countOnly && parsed.offset !== undefined) {
    sql += ` OFFSET ${parsed.offset}`
  }

  return sql
}

/**
 * Validates and sanitizes a collection name.
 * Returns safe name for use as table suffix.
 */
export function sanitizeCollectionName(name: string): string {
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid collection name: ${name}. Must be alphanumeric with underscores.`)
  }
  return name
}

/**
 * Validates a field path for use in SQL queries.
 * Prevents SQL injection by only allowing safe characters.
 *
 * @param field The field path to validate (e.g., "name", "address.city")
 * @throws Error if the field path contains invalid characters
 */
export function validateFieldPath(field: string): void {
  // Allow alphanumeric, underscore, and dots (for nested paths like "address.city")
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) {
    throw new Error(`Invalid field path: ${field}. Must start with letter/underscore and contain only alphanumeric, underscore, or dots.`)
  }
}
