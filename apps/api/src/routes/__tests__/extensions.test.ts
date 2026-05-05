/**
 * extensions route tests — GET /extensions/thread-hints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  closeDb,
  initDatabase,
  createConsoleLogger,
  resetDatabaseForTests,
} from '@stina/adapters-node'
import { getChatMigrationsPath } from '@stina/chat/db'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { extensionRoutes } from '../extensions.js'
import type { ExtensionThreadHints } from '@stina/extension-api'

// ---------------------------------------------------------------------------
// Mock setup.ts so we can control what getExtensionHost() returns
// ---------------------------------------------------------------------------

vi.mock('../../setup.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../setup.js')>()
  return {
    ...original,
    getExtensionHost: vi.fn(() => null),
    getExtensionInstaller: vi.fn(() => null),
    syncExtensions: vi.fn(),
  }
})

// Import AFTER vi.mock so we get the mocked version
import { getExtensionHost } from '../../setup.js'

// ---------------------------------------------------------------------------
// Test app builder — mirrors the pattern from threads.test.ts
// ---------------------------------------------------------------------------

async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-extensions-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
  const logger = createConsoleLogger('error')
  initDatabase({
    logger,
    dbPath,
    migrations: [getChatMigrationsPath(), getThreadsMigrationsPath()],
  })

  const app = Fastify({ logger: false })

  // Stub auth — requireAuth only looks at request.isAuthenticated and request.user
  app.decorateRequest('isAuthenticated', false)
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { isAuthenticated: boolean }).isAuthenticated = true
    ;(request as unknown as { user: { id: string; role: string } }).user = {
      id: 'test-user',
      role: 'user',
    }
  })

  await app.register(extensionRoutes)
  await app.ready()

  return { app, dbPath }
}

async function teardownApp(app: FastifyInstance, dbPath: string): Promise<void> {
  await app.close()
  closeDb()
  resetDatabaseForTests()
  if (fs.existsSync(dbPath)) {
    try {
      fs.unlinkSync(dbPath)
    } catch {
      // ignore — WAL may hold the file briefly
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /extensions/thread-hints', () => {
  let app: FastifyInstance
  let dbPath: string

  beforeEach(async () => {
    const ctx = await buildTestApp()
    app = ctx.app
    dbPath = ctx.dbPath
  })

  afterEach(async () => {
    await teardownApp(app, dbPath)
    vi.restoreAllMocks()
  })

  it('returns an empty object when no ExtensionHost is initialised', async () => {
    vi.mocked(getExtensionHost).mockReturnValue(null)

    const res = await app.inject({ method: 'GET', url: '/extensions/thread-hints' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({})
  })

  it('returns the hints map from ExtensionHost when one is available', async () => {
    const mockHints: Record<string, ExtensionThreadHints> = {
      'stina-ext-mail': { accent: 'sky', card_style: 'left-line', icon: '✉' },
      'stina-ext-calendar': { accent: 'olive', card_style: 'bordered' },
    }

    vi.mocked(getExtensionHost).mockReturnValue({
      getThreadHints: () => mockHints,
    } as unknown as ReturnType<typeof getExtensionHost>)

    const res = await app.inject({ method: 'GET', url: '/extensions/thread-hints' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(mockHints)
  })
})
