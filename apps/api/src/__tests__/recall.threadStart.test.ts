/**
 * Integration test: recall results surfaced in the canned-stub note
 *
 * Proves the full pipeline:
 *   RecallProviderRegistry (with dev-test echo provider)
 *   → DefaultMemoryContextLoader.load() with linked entities
 *   → runDecisionTurn → cannedStubProducer
 *   → persisted Stina message contains "1 extensionsnotering"
 *
 * Deliberately does NOT inject a model/producer at the api layer — the canned
 * stub fires when no model is configured, which is exactly what makes the count
 * assertion visible in the persisted Stina message text.
 *
 * The dev-test extension echoes the query string: for a mail thread the
 * entity ref_id is the sender's lowercased email, so the echo result is
 * "echoed: fake@example.com". That result surfaces as 1 extensionsnotering.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
import { getThreadsMigrationsPath, ThreadRepository } from '@stina/threads/db'
import { getMemoryMigrationsPath, StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'
import { getAutonomyMigrationsPath, ActivityLogRepository } from '@stina/autonomy/db'
import { getChatMigrationsPath } from '@stina/chat/db'
import { runDecisionTurn, DefaultMemoryContextLoader, applyFailureFraming } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from '../asRedesign2026Db.js'
import type { Message } from '@stina/core'
import { deriveTitleFromAppContent, deriveLinkedEntities, type EmitThreadEventInput } from '@stina/extension-host'
import { NodeExtensionHost } from '@stina/extension-host'
import { RecallProviderRegistry } from '@stina/memory'
import type { ExtensionManifest } from '@stina/extension-api'

// ── dev-test extension paths ─────────────────────────────────────────────────

const DEV_TEST_MANIFEST_PATH = path.resolve(
  __dirname,
  '../../../../packages/dev-test-extension/manifest.json'
)
const DEV_TEST_EXTENSION_DIR = path.resolve(
  __dirname,
  '../../../../packages/dev-test-extension/dist'
)

/** Poll until condition is true, reject after timeoutMs */
function waitFor(
  condition: () => boolean,
  { timeoutMs = 5000, intervalMs = 50, message = 'Condition not met in time' } = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (condition()) { resolve(); return }
      if (Date.now() >= deadline) { reject(new Error(message)); return }
      setTimeout(check, intervalMs)
    }
    check()
  })
}

// ── test ─────────────────────────────────────────────────────────────────────

describe('recall at thread start — canned stub count assertion', () => {
  let host: NodeExtensionHost
  let registry: RecallProviderRegistry
  let dbPath: string

  beforeEach(async () => {
    closeDb()
    resetDatabaseForTests()

    dbPath = path.join(
      os.tmpdir(),
      `stina-recall-threadstart-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
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

    registry = new RecallProviderRegistry()
    host = new NodeExtensionHost({
      storagePath: path.join(os.tmpdir(), `stina-recall-ts-host-${Date.now()}`),
      recallProviderRegistry: registry,
    })

    // Load dev-test extension (it registers an echo recall provider on activate)
    const { default: manifestJson } = await import(DEV_TEST_MANIFEST_PATH, { assert: { type: 'json' } })
    const manifest = manifestJson as ExtensionManifest

    await host.loadExtension(manifest, DEV_TEST_EXTENSION_DIR)

    // Wait for the worker to activate and register the recall provider
    await waitFor(
      () => registry.has('dev-test'),
      { timeoutMs: 5000, message: 'dev-test recall provider was not registered within 5 s' }
    )
  })

  afterEach(async () => {
    // Unload extensions so worker threads are terminated cleanly
    for (const ext of host.getExtensions()) {
      try { await host.unloadExtension(ext.id) } catch { /* ignore */ }
    }
    closeDb()
    resetDatabaseForTests()
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath) } catch { /* ignore */ }
    }
  })

  it('persisted Stina message contains "1 extensionsnotering" for mail thread with linked entity', async () => {
    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
    const logger = createConsoleLogger('error')

    // Build a mail-triggered event input (same shape as dev-test emits)
    const mail_id = `test-mail-${Date.now()}`
    const fromAddress = 'fake@example.com'
    const input: EmitThreadEventInput = {
      trigger: { kind: 'mail', extension_id: 'dev-test', mail_id },
      content: {
        kind: 'mail',
        from: fromAddress,
        subject: 'Testmail from recall integration test',
        snippet: 'Hej, det här är ett genererat testmail.',
        mail_id,
      },
      source: { extension_id: 'dev-test' },
    }

    // Create thread + app message (mirrors server.ts emitThreadEvent callback)
    const title = deriveTitleFromAppContent(input.content)
    const linkedEntities = deriveLinkedEntities(input)
    const thread = await repo.create({ trigger: input.trigger, title, linkedEntities })

    await repo.appendMessage({
      thread_id: thread.id,
      author: 'app',
      visibility: 'normal',
      source: input.source,
      content: input.content,
    })

    // Wire the memory loader with the live recall registry (key step for this test)
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb)),
      registry,
      logger
    )

    // Run the decision turn (no model configured → canned stub fires)
    try {
      await runDecisionTurn({ threadId: thread.id, threadRepo: repo, memoryLoader })
    } catch (err) {
      await applyFailureFraming(
        { threadRepo: repo, activityLogRepo, logger },
        { thread_id: thread.id, error: err }
      )
    }

    // Fetch the persisted messages and find Stina's reply
    const messages = await repo.listMessages(thread.id)
    const stinaMsg = messages.find((m): m is Extract<Message, { author: 'stina' }> => m.author === 'stina')

    expect(stinaMsg).toBeDefined()
    const text = stinaMsg?.content.text ?? ''

    // Primary assertion: the canned stub should mention "1 extensionsnotering"
    // because the dev-test echo provider returns exactly one result per query.
    expect(text).toMatch(/1 extensionsnotering/)

    // Verify the thread had a linked entity (the mail sender)
    expect(thread.linked_entities.length).toBeGreaterThan(0)
    // The entity ref_id for a mail is the lowercased sender address
    const entity = thread.linked_entities[0]!
    expect(entity.ref_id).toBe(fromAddress.toLowerCase())
  })
})
