import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readMigrationMarker } from '../readMigrationMarker.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-migration-marker-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('readMigrationMarker', () => {
  it('returns a parsed object for a valid JSON marker file with all fields', () => {
    const markerPath = path.join(tmpDir, 'migration-in-progress')
    const marker = {
      started_at: 1700000000000,
      phase: 'package:chat',
      last_completed_package: null,
      backup_path: '/some/path/backup.db',
      source_version: 'v0.36.0',
      target_version: 'v1.0.0',
    }
    fs.writeFileSync(markerPath, JSON.stringify(marker), 'utf8')

    const result = readMigrationMarker(markerPath)

    expect(result).toEqual(marker)
  })

  it('returns null when the file does not exist', () => {
    const markerPath = path.join(tmpDir, 'does-not-exist')

    const result = readMigrationMarker(markerPath)

    expect(result).toBeNull()
  })

  it('returns null when the file contains invalid JSON', () => {
    const markerPath = path.join(tmpDir, 'migration-in-progress')
    fs.writeFileSync(markerPath, 'not valid json {{{', 'utf8')

    const result = readMigrationMarker(markerPath)

    expect(result).toBeNull()
  })

  it('returns an object with only the present fields for a partial marker', () => {
    const markerPath = path.join(tmpDir, 'migration-in-progress')
    const partial = { phase: 'starting', source_version: 'v0.5.0' }
    fs.writeFileSync(markerPath, JSON.stringify(partial), 'utf8')

    const result = readMigrationMarker(markerPath)

    expect(result).toEqual(partial)
    expect(result).not.toHaveProperty('started_at')
    expect(result).not.toHaveProperty('backup_path')
  })

  it('returns the object as-is when the marker contains extra unknown fields', () => {
    const markerPath = path.join(tmpDir, 'migration-in-progress')
    const withExtra = {
      phase: 'sanity-checks',
      started_at: 1700000000000,
      unknown_future_field: 'some-value',
    }
    fs.writeFileSync(markerPath, JSON.stringify(withExtra), 'utf8')

    const result = readMigrationMarker(markerPath)

    expect(result).toMatchObject({ phase: 'sanity-checks', started_at: 1700000000000 })
    // Extra fields are preserved (no stripping)
    expect((result as Record<string, unknown>)['unknown_future_field']).toBe('some-value')
  })
})
