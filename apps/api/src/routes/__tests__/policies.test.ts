import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import {
  closeDb,
  initDatabase,
  getDatabase,
  createConsoleLogger,
  resetDatabaseForTests,
} from '@stina/adapters-node'
import { getMemoryMigrationsPath, StandingInstructionRepository } from '@stina/memory/db'
import { getAutonomyMigrationsPath, ActivityLogRepository } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { toolRegistry, resetToolRegistryForTesting } from '@stina/chat'
import type { AutoPolicy } from '@stina/core'
import { policyRoutes } from '../policies.js'
import { asAutonomyDb, asMemoryDb } from '../../asRedesign2026Db.js'

/**
 * Build an isolated test app: temp DB path, fresh schema, stub auth that
 * always passes, policy routes registered. Each test gets its own DB so
 * state doesn't leak.
 */
async function buildTestApp(): Promise<{
  app: FastifyInstance
  dbPath: string
}> {
  closeDb()
  resetDatabaseForTests()

  const dbPath = path.join(
    os.tmpdir(),
    `stina-policies-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  )
  const logger = createConsoleLogger('error')
  initDatabase({
    logger,
    dbPath,
    migrations: [
      getChatMigrationsPath(),
      getThreadsMigrationsPath(),
      getMemoryMigrationsPath(),
      getAutonomyMigrationsPath(),
    ],
  })

  const app = Fastify({ logger: false })
  // Stub auth: requireAuth checks request.isAuthenticated
  app.decorateRequest('isAuthenticated', false)
  app.decorateRequest('user', null)
  app.addHook('onRequest', async (request) => {
    ;(request as unknown as { isAuthenticated: boolean }).isAuthenticated = true
    ;(request as unknown as { user: { id: string; role: string } }).user = {
      id: 'test-user',
      role: 'user',
    }
  })

  await app.register(policyRoutes)
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
      // ignore
    }
  }
}

describe('policyRoutes', () => {
  let app: FastifyInstance
  let dbPath: string

  beforeEach(async () => {
    // Reset the tool registry singleton so each test starts clean
    resetToolRegistryForTesting()
    ;({ app, dbPath } = await buildTestApp())
  })

  afterEach(async () => {
    await teardownApp(app, dbPath)
    resetToolRegistryForTesting()
  })

  // ── GET /policies ───────────────────────────────────────────────────────────

  it('GET /policies returns empty array when no policies exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/policies' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('GET /policies returns policies newest-first', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })
    toolRegistry.register({
      id: 'archive-mail',
      name: 'Archive Mail',
      description: 'Archive an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    await app.inject({ method: 'POST', url: '/policies', payload: { tool_id: 'send-email' } })
    await app.inject({ method: 'POST', url: '/policies', payload: { tool_id: 'archive-mail' } })

    const response = await app.inject({ method: 'GET', url: '/policies' })
    expect(response.statusCode).toBe(200)
    const policies = response.json<AutoPolicy[]>()
    expect(policies).toHaveLength(2)
    // Newest first: archive-mail was created second
    expect(policies[0]?.tool_id).toBe('archive-mail')
    expect(policies[1]?.tool_id).toBe('send-email')
  })

  // ── GET /policies/available-tools ──────────────────────────────────────────

  it('GET /policies/available-tools returns only high-severity tools', async () => {
    // Register tools of mixed severity
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })
    toolRegistry.register({
      id: 'get-weather',
      name: 'Get Weather',
      description: 'Get weather',
      extensionId: 'ext-weather',
      severity: 'medium',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })
    toolRegistry.register({
      id: 'delete-all',
      name: 'Delete All',
      description: 'Delete everything',
      extensionId: 'ext-danger',
      severity: 'critical',
      requiresConfirmation: true,
      execute: async () => ({ success: true }),
    })

    const response = await app.inject({ method: 'GET', url: '/policies/available-tools' })
    expect(response.statusCode).toBe(200)
    const tools = response.json<Array<{ id: string; severity: string }>>()
    expect(tools).toHaveLength(1)
    expect(tools[0]?.id).toBe('send-email')
    expect(tools[0]?.severity).toBe('high')
  })

  // ── POST /policies ─────────────────────────────────────────────────────────

  it('POST /policies creates a policy with mode=inform and created_by_suggestion=false', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'send-email' },
    })

    expect(response.statusCode).toBe(201)
    const policy = response.json<AutoPolicy>()
    expect(policy.tool_id).toBe('send-email')
    expect(policy.mode).toBe('inform')
    expect(policy.created_by_suggestion).toBe(false)
    expect(policy.scope).toEqual({})
    expect(typeof policy.id).toBe('string')
  })

  it('POST /policies with unknown tool_id → 422', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'nonexistent-tool' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json<{ error: string }>().error).toContain('Unknown tool: nonexistent-tool')
  })

  it('POST /policies with non-high tool → 422', async () => {
    toolRegistry.register({
      id: 'get-weather',
      name: 'Get Weather',
      description: 'Get weather',
      extensionId: 'ext-weather',
      severity: 'medium',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'get-weather' },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json<{ error: string }>().error).toContain('Only high-severity tools')
    expect(response.json<{ error: string }>().error).toContain('medium')
  })

  it('POST /policies with non-existent standing_instruction_id → 422', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    const response = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: {
        tool_id: 'send-email',
        standing_instruction_id: 'nonexistent-instruction-id',
      },
    })
    expect(response.statusCode).toBe(422)
    expect(response.json<{ error: string }>().error).toContain('Standing instruction not found')
  })

  it('POST /policies twice with same tool+scope → 409', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    const first = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'send-email' },
    })
    expect(first.statusCode).toBe(201)

    const second = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'send-email' },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json<{ error: string }>().error).toContain('same scope already exists')
  })

  it('POST /policies succeeds with a valid standing_instruction_id', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    // Seed a real standing instruction
    const rawDb = getDatabase()
    const siRepo = new StandingInstructionRepository(asMemoryDb(rawDb))
    const instruction = await siRepo.create({
      rule: 'Always send emails politely',
      scope: {},
      created_by: 'user',
    })

    const response = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: {
        tool_id: 'send-email',
        standing_instruction_id: instruction.id,
      },
    })
    expect(response.statusCode).toBe(201)
    const policy = response.json<AutoPolicy>()
    expect(policy.scope.standing_instruction_id).toBe(instruction.id)
  })

  // ── DELETE /policies/:id ───────────────────────────────────────────────────

  it('DELETE /policies/:id revokes policy and writes memory_change entry with tool severity', async () => {
    toolRegistry.register({
      id: 'send-email',
      name: 'Send Email',
      description: 'Send an email',
      extensionId: 'ext-mail',
      severity: 'high',
      requiresConfirmation: false,
      execute: async () => ({ success: true }),
    })

    // Create a policy first
    const created = await app.inject({
      method: 'POST',
      url: '/policies',
      payload: { tool_id: 'send-email' },
    })
    expect(created.statusCode).toBe(201)
    const policy = created.json<AutoPolicy>()

    // Revoke it
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/policies/${policy.id}`,
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toEqual({ success: true })

    // Policy should no longer appear in list
    const listResponse = await app.inject({ method: 'GET', url: '/policies' })
    expect(listResponse.json<AutoPolicy[]>()).toHaveLength(0)

    // Activity log should have a memory_change entry
    const rawDb = getDatabase()
    const activityRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
    const entries = await activityRepo.list({ kind: 'memory_change' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.severity).toBe('high')
    expect(entries[0]?.summary).toContain('send-email')
    expect(entries[0]?.details?.['previous']).toBeDefined()
  })

  it('DELETE /policies/:id with unknown id → 404', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/policies/nonexistent-policy-id',
    })
    expect(response.statusCode).toBe(404)
    expect(response.json<{ error: string }>().error).toContain('Policy not found')
  })
})
