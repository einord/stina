/**
 * QueryParser Tests
 *
 * Tests for SQL query building and validation, including SQL injection prevention.
 */

import { describe, it, expect } from 'vitest'
import {
  parseQuery,
  buildSelectQuery,
  sanitizeCollectionName,
  validateFieldPath,
} from './QueryParser.js'

describe('QueryParser', () => {
  describe('sanitizeCollectionName', () => {
    it('should allow alphanumeric and underscores', () => {
      expect(sanitizeCollectionName('my_collection_123')).toBe('my_collection_123')
    })

    it('should throw on invalid characters', () => {
      expect(() => sanitizeCollectionName('my-collection')).toThrow('Invalid collection name')
      expect(() => sanitizeCollectionName('my.collection')).toThrow('Invalid collection name')
      expect(() => sanitizeCollectionName('my collection')).toThrow('Invalid collection name')
      expect(() => sanitizeCollectionName('my;collection')).toThrow('Invalid collection name')
    })

    it('should throw on empty collection name', () => {
      expect(() => sanitizeCollectionName('')).toThrow('Invalid collection name')
    })
  })

  describe('validateFieldPath', () => {
    it('should allow simple field names', () => {
      expect(() => validateFieldPath('name')).not.toThrow()
      expect(() => validateFieldPath('user_id')).not.toThrow()
    })

    it('should allow nested field paths', () => {
      expect(() => validateFieldPath('user.name')).not.toThrow()
      expect(() => validateFieldPath('data.user.address.city')).not.toThrow()
    })

    it('should throw on invalid characters', () => {
      expect(() => validateFieldPath('user;DROP TABLE')).toThrow('Invalid field path')
      expect(() => validateFieldPath('user--comment')).toThrow('Invalid field path')
      expect(() => validateFieldPath('user/*')).toThrow('Invalid field path')
    })

    it('should throw on SQL injection attempts', () => {
      expect(() => validateFieldPath("'; DROP TABLE users; --")).toThrow('Invalid field path')
      expect(() => validateFieldPath('1=1')).toThrow('Invalid field path')
      expect(() => validateFieldPath('user OR 1=1')).toThrow('Invalid field path')
    })

    it('should throw on empty field path', () => {
      expect(() => validateFieldPath('')).toThrow('Invalid field path')
    })
  })

  describe('parseQuery', () => {
    it('should handle empty query', () => {
      const result = parseQuery()
      expect(result.whereClause).toBe('1=1')
      expect(result.params).toEqual([])
      expect(result.orderByClause).toBeUndefined()
      expect(result.limit).toBeUndefined()
      expect(result.offset).toBeUndefined()
    })

    it('should handle simple equality query', () => {
      const result = parseQuery({ name: 'John' })
      expect(result.whereClause).toContain("json_extract(data, '$.name') = ?")
      expect(result.params).toEqual(['John'])
    })

    it('should handle $gt operator', () => {
      const result = parseQuery({ age: { $gt: 18 } })
      expect(result.whereClause).toContain("json_extract(data, '$.age') > ?")
      expect(result.params).toEqual([18])
    })

    it('should handle $gte operator', () => {
      const result = parseQuery({ age: { $gte: 18 } })
      expect(result.whereClause).toContain("json_extract(data, '$.age') >= ?")
      expect(result.params).toEqual([18])
    })

    it('should handle $lt operator', () => {
      const result = parseQuery({ age: { $lt: 65 } })
      expect(result.whereClause).toContain("json_extract(data, '$.age') < ?")
      expect(result.params).toEqual([65])
    })

    it('should handle $lte operator', () => {
      const result = parseQuery({ age: { $lte: 65 } })
      expect(result.whereClause).toContain("json_extract(data, '$.age') <= ?")
      expect(result.params).toEqual([65])
    })

    it('should handle $ne operator', () => {
      const result = parseQuery({ status: { $ne: 'deleted' } })
      expect(result.whereClause).toContain("json_extract(data, '$.status') != ?")
      expect(result.params).toEqual(['deleted'])
    })

    it('should handle $in operator', () => {
      const result = parseQuery({ status: { $in: ['active', 'pending'] } })
      expect(result.whereClause).toContain("json_extract(data, '$.status') IN (?, ?)")
      expect(result.params).toEqual(['active', 'pending'])
    })

    it('should throw error for empty $in array', () => {
      expect(() => parseQuery({ status: { $in: [] } })).toThrow('$in operator requires a non-empty array')
    })

    it('should handle $contains operator', () => {
      const result = parseQuery({ description: { $contains: 'test' } })
      expect(result.whereClause).toContain("LOWER(json_extract(data, '$.description')) LIKE ? ESCAPE '\\'")
      expect(result.params).toEqual(['%test%'])
    })

    it('should escape LIKE wildcards in $contains operator', () => {
      const result = parseQuery({ name: { $contains: 'test_pattern%' } })
      // Wildcards should be escaped
      expect(result.params).toEqual(['%test\\_pattern\\%%'])
    })

    it('should handle multiple conditions', () => {
      const result = parseQuery({
        age: { $gte: 18 },
        status: 'active',
      })
      expect(result.whereClause).toContain("json_extract(data, '$.age') >= ?")
      expect(result.whereClause).toContain("json_extract(data, '$.status') = ?")
      expect(result.params).toEqual([18, 'active'])
    })

    it('should validate field paths in queries', () => {
      expect(() => parseQuery({ 'user; DROP TABLE': 'test' })).toThrow('Invalid field path')
    })
  })

  describe('parseQuery with options', () => {
    it('should handle sort ascending', () => {
      const result = parseQuery({}, { sort: { name: 'asc' } })
      expect(result.orderByClause).toContain("json_extract(data, '$.name') ASC")
    })

    it('should handle sort descending', () => {
      const result = parseQuery({}, { sort: { name: 'desc' } })
      expect(result.orderByClause).toContain("json_extract(data, '$.name') DESC")
    })

    it('should normalize sort direction case', () => {
      // @ts-expect-error - testing case-insensitive normalization
      const result = parseQuery({}, { sort: { name: 'AsC' } })
      expect(result.orderByClause).toContain("json_extract(data, '$.name') ASC")
    })

    it('should reject invalid sort directions', () => {
      // @ts-expect-error - testing invalid sort direction
      expect(() => parseQuery({}, { sort: { name: 'invalid' } })).toThrow('Invalid sort direction')
      // @ts-expect-error - testing SQL injection attempt in sort direction
      expect(() => parseQuery({}, { sort: { name: 'ASC; DROP TABLE' } })).toThrow('Invalid sort direction')
    })

    it('should validate sort field paths', () => {
      expect(() => parseQuery({}, { sort: { 'user; DROP': 'asc' } })).toThrow('Invalid field path')
    })

    it('should handle multiple sort fields', () => {
      const result = parseQuery({}, { sort: { age: 'desc', name: 'asc' } })
      expect(result.orderByClause).toContain("json_extract(data, '$.age') DESC")
      expect(result.orderByClause).toContain("json_extract(data, '$.name') ASC")
    })

    it('should handle limit', () => {
      const result = parseQuery({}, { limit: 10 })
      expect(result.limit).toBe(10)
    })

    it('should reject negative limit', () => {
      expect(() => parseQuery({}, { limit: -1 })).toThrow('Invalid limit')
    })

    it('should reject non-integer limit', () => {
      expect(() => parseQuery({}, { limit: 10.5 })).toThrow('Invalid limit')
    })

    it('should handle offset', () => {
      const result = parseQuery({}, { offset: 20 })
      expect(result.offset).toBe(20)
    })

    it('should reject negative offset', () => {
      expect(() => parseQuery({}, { offset: -1 })).toThrow('Invalid offset')
    })

    it('should reject non-integer offset', () => {
      expect(() => parseQuery({}, { offset: 20.5 })).toThrow('Invalid offset')
    })

    it('should handle combined options', () => {
      const result = parseQuery(
        { status: 'active' },
        {
          sort: { created_at: 'desc' },
          limit: 10,
          offset: 20,
        }
      )
      expect(result.whereClause).toContain("json_extract(data, '$.status') = ?")
      expect(result.orderByClause).toContain("json_extract(data, '$.created_at') DESC")
      expect(result.limit).toBe(10)
      expect(result.offset).toBe(20)
    })
  })

  describe('buildSelectQuery', () => {
    it('should build basic SELECT query', () => {
      const parsed = parseQuery({ name: 'John' })
      const sql = buildSelectQuery('doc_users', parsed)
      expect(sql).toContain('SELECT id, data, created_at, updated_at')
      expect(sql).toContain('FROM doc_users')
      expect(sql).toContain('WHERE')
    })

    it('should build COUNT query', () => {
      const parsed = parseQuery({ name: 'John' })
      const sql = buildSelectQuery('doc_users', parsed, true)
      expect(sql).toContain('SELECT COUNT(*) as count')
      expect(sql).toContain('FROM doc_users')
      expect(sql).not.toContain('ORDER BY')
      expect(sql).not.toContain('LIMIT')
    })

    it('should include ORDER BY when provided', () => {
      const parsed = parseQuery({}, { sort: { name: 'asc' } })
      const sql = buildSelectQuery('doc_users', parsed)
      expect(sql).toContain('ORDER BY')
    })

    it('should include LIMIT when provided', () => {
      const parsed = parseQuery({}, { limit: 10 })
      const sql = buildSelectQuery('doc_users', parsed)
      expect(sql).toContain('LIMIT 10')
    })

    it('should include OFFSET when provided', () => {
      const parsed = parseQuery({}, { offset: 20 })
      const sql = buildSelectQuery('doc_users', parsed)
      expect(sql).toContain('OFFSET 20')
    })

    it('should not include ORDER BY, LIMIT, OFFSET in COUNT queries', () => {
      const parsed = parseQuery({}, { sort: { name: 'asc' }, limit: 10, offset: 20 })
      const sql = buildSelectQuery('doc_users', parsed, true)
      expect(sql).not.toContain('ORDER BY')
      expect(sql).not.toContain('LIMIT')
      expect(sql).not.toContain('OFFSET')
    })
  })

  describe('SQL Injection Prevention', () => {
    it('should prevent injection via field names', () => {
      expect(() => parseQuery({ "'; DROP TABLE users; --": 'value' })).toThrow()
    })

    it('should prevent injection via sort fields', () => {
      expect(() => parseQuery({}, { sort: { "'; DROP TABLE users; --": 'asc' } })).toThrow()
    })

    it('should prevent injection via sort direction', () => {
      // @ts-expect-error - testing SQL injection attempt in sort direction
      expect(() => parseQuery({}, { sort: { name: "ASC; DROP TABLE users; --" } })).toThrow()
    })

    it('should use parameterized queries for values', () => {
      const result = parseQuery({ name: "'; DROP TABLE users; --" })
      // Value should be in params, not in SQL string
      expect(result.params).toContain("'; DROP TABLE users; --")
      expect(result.whereClause).not.toContain('DROP TABLE')
    })

    it('should prevent injection via collection names', () => {
      expect(() => sanitizeCollectionName('users; DROP TABLE users; --')).toThrow()
    })

    it('should prevent injection via nested field paths', () => {
      expect(() => validateFieldPath("user.name'; DROP TABLE users; --")).toThrow()
    })
  })
})
