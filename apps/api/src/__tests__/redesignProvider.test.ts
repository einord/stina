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
import {
  getChatMigrationsPath,
  ModelConfigRepository,
  UserSettingsRepository,
} from '@stina/chat/db'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import type { NodeExtensionHost, ProviderInfo } from '@stina/extension-host'
import type { ChatMessage, ChatOptions, StreamEvent } from '@stina/extension-api'
import { buildRedesignDecisionTurnProducer } from '../redesignProvider.js'
import type { Logger } from '@stina/core'

/**
 * Minimal in-memory ExtensionHost stub. We only need `getProvider()` and
 * `chat()` for `buildRedesignDecisionTurnProducer`; all other methods are
 * stubbed to throw so an accidental dependency surfaces immediately.
 */
function makeExtensionHostStub(opts: {
  registeredProviders: string[]
  events: StreamEvent[]
  capture: { messages: ChatMessage[]; options: ChatOptions; providerId: string | null }
}): NodeExtensionHost {
  const captured = opts.capture
  return {
    getProvider(providerId: string): ProviderInfo | undefined {
      if (!opts.registeredProviders.includes(providerId)) return undefined
      return { id: providerId, name: providerId, extensionId: 'fake-ext' }
    },
    async *chat(providerId: string, messages: ChatMessage[], options: ChatOptions) {
      captured.providerId = providerId
      captured.messages = messages
      captured.options = options
      for (const event of opts.events) {
        yield event
      }
    },
  } as unknown as NodeExtensionHost
}

const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

describe('buildRedesignDecisionTurnProducer', () => {
  let dbPath: string

  beforeEach(() => {
    closeDb()
    resetDatabaseForTests()
    dbPath = path.join(
      os.tmpdir(),
      `stina-redesign-provider-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    )
    initDatabase({
      logger: createConsoleLogger('error'),
      dbPath,
      migrations: [
        getChatMigrationsPath(),
        getThreadsMigrationsPath(),
        getMemoryMigrationsPath(),
        getAutonomyMigrationsPath(),
      ],
    })
  })

  afterEach(() => {
    closeDb()
    resetDatabaseForTests()
    if (fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath)
      } catch {
        // WAL hold — ignore.
      }
    }
  })

  it('returns null when no extension host is wired', async () => {
    const producer = await buildRedesignDecisionTurnProducer({
      extensionHost: null,
      userId: 'u1',
      logger: silentLogger,
    })
    expect(producer).toBeNull()
  })

  it('returns null when the user has no default model config', async () => {
    const host = makeExtensionHostStub({
      registeredProviders: ['openai'],
      events: [],
      capture: { messages: [], options: {}, providerId: null },
    })
    const producer = await buildRedesignDecisionTurnProducer({
      extensionHost: host,
      userId: 'u1',
      logger: silentLogger,
    })
    expect(producer).toBeNull()
  })

  it('returns null when the configured provider is not currently registered', async () => {
    const db = getDatabase()
    const modelConfigs = new ModelConfigRepository(db)
    await modelConfigs.create('cfg-1', {
      name: 'Default',
      providerId: 'absent-provider',
      providerExtensionId: 'absent-ext',
      modelId: 'gpt-x',
    })
    const userSettings = new UserSettingsRepository(db, 'u1')
    await userSettings.setDefaultModelConfigId('cfg-1')

    const host = makeExtensionHostStub({
      registeredProviders: ['openai'], // does NOT include 'absent-provider'
      events: [],
      capture: { messages: [], options: {}, providerId: null },
    })

    const producer = await buildRedesignDecisionTurnProducer({
      extensionHost: host,
      userId: 'u1',
      logger: silentLogger,
    })
    expect(producer).toBeNull()
  })

  it('builds a working producer when host + default config + provider all present', async () => {
    const db = getDatabase()
    const modelConfigs = new ModelConfigRepository(db)
    await modelConfigs.create('cfg-1', {
      name: 'Default',
      providerId: 'openai',
      providerExtensionId: 'openai-ext',
      modelId: 'gpt-4o-mini',
      settingsOverride: { temperature: 0.4 },
    })
    const userSettings = new UserSettingsRepository(db, 'u1')
    await userSettings.setDefaultModelConfigId('cfg-1')

    const capture = { messages: [] as ChatMessage[], options: {} as ChatOptions, providerId: null as string | null }
    const host = makeExtensionHostStub({
      registeredProviders: ['openai'],
      events: [
        { type: 'content', text: 'Hej ' },
        { type: 'content', text: 'där.' },
        { type: 'done' },
      ],
      capture,
    })

    const producer = await buildRedesignDecisionTurnProducer({
      extensionHost: host,
      userId: 'u1',
      logger: silentLogger,
    })
    expect(producer).not.toBeNull()

    // Drive a turn through it directly (no thread repo needed) — producer is
    // a plain function from context to output.
    const out = await producer!({
      thread: {
        id: 't1',
        trigger: { kind: 'user' },
        status: 'active',
        surfaced_at: null,
        notified_at: null,
        title: 'Test',
        summary: null,
        linked_entities: [],
        created_at: 0,
        last_activity_at: 0,
      },
      messages: [
        {
          id: 'u1',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'hej' },
          created_at: 0,
        },
      ],
      memory: { active_instructions: [], linked_facts: [] },
    })

    expect(out.visibility).toBe('normal')
    expect(out.content.text).toBe('Hej där.')
    expect(capture.providerId).toBe('openai')
    expect(capture.options.model).toBe('gpt-4o-mini')
    expect(capture.options.settings).toEqual({ temperature: 0.4 })
    // The userId must end up in the dispatcher's options.context for
    // per-user logging / quota tracking.
    expect(capture.options.context?.userId).toBe('u1')
    // Messages: system prompt at index 0, then mapped timeline.
    expect(capture.messages[0]!.role).toBe('system')
    expect(capture.messages[1]).toEqual({ role: 'user', content: 'hej' })
  })
})
