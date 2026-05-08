import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { healthRoutes } from './routes/health.js'
import { helloRoutes } from './routes/hello.js'
import { themeRoutes } from './routes/themes.js'
import { extensionRoutes } from './routes/extensions.js'
import { chatRoutes } from './routes/chat.js'
import { chatStreamRoutes, queueInstructionForUser } from './routes/chatStream.js'
import { settingsRoutes } from './routes/settings.js'
import { toolsRoutes } from './routes/tools.js'
import { createAuthRoutes } from './routes/auth.js'
import { createElectronAuthRoutes } from './routes/electronAuth.js'

import { scheduledJobsRoutes } from './routes/scheduledJobs.js'
import { systemRoutes } from './routes/system.js'
import { threadRoutes } from './routes/threads.js'
import { notificationRoutes } from './routes/notifications.js'
import { activityRoutes } from './routes/activity.js'
import { policyRoutes } from './routes/policies.js'
import { setupExtensions, getExtensionHost, getRecallProviderRegistry } from './setup.js'
import { buildRedesignDecisionTurnProducer } from './redesignProvider.js'
import { ThreadRepository } from '@stina/threads/db'
import { StandingInstructionRepository, ProfileFactRepository } from '@stina/memory/db'
import { DefaultMemoryContextLoader, spawnTriggeredThread, DegradedModeTracker, NotificationDispatcher } from '@stina/orchestrator'
import { ActivityLogRepository, AutoPolicyRepository, ToolSeveritySnapshotRepository } from '@stina/autonomy/db'
import { applySeverityChangeCascade } from '@stina/orchestrator'
import { asThreadsDb, asMemoryDb, asAutonomyDb } from './asRedesign2026Db.js'
import { type EmitThreadEventInput } from '@stina/extension-host'
import { RUNTIME_EXTENSION_ID, type ThreadTrigger, type AppContent } from '@stina/core'
import { initDatabase, createConsoleLogger, getLogLevelFromEnv, getRawDb, getDatabase, getAppDataDir } from '@stina/adapters-node'
import { runMigrationIfNeeded, readMigrationMarker } from '@stina/migration'
import path from 'node:path'
import fs from 'node:fs'
import {
  initAppSettingsStore,
  getChatMigrationsPath,
  UserSettingsRepository,
} from '@stina/chat/db'
import { getThreadsMigrationsPath } from '@stina/threads/db'
import { getMemoryMigrationsPath } from '@stina/memory/db'
import { getAutonomyMigrationsPath } from '@stina/autonomy/db'
import { asChatDb } from './asChatDb.js'
import {
  SchedulerService,
  SchedulerRepository,
  SchedulerCleanupService,
  getSchedulerMigrationsPath,
} from '@stina/scheduler'
import {
  authPlugin,
  getAuthMigrationsPath,
  AuthService,
  TokenService,
  PasskeyService,
  ElectronAuthService,
} from '@stina/auth'
import {
  UserRepository,
  PasskeyCredentialRepository,
  RefreshTokenRepository,
  AuthConfigRepository,
  InvitationRepository,
} from '@stina/auth/db'
import type { Logger } from '@stina/core'

export interface ServerOptions {
  port: number
  host: string
  logger?: Logger
  /** If true, authentication is required for protected routes */
  requireAuth?: boolean
  /** Default user ID for local mode (when requireAuth is false) */
  defaultUserId?: string
}

/**
 * Input accepted by the runtime-only `emitEventInternal` API (§04 line 49).
 * Accepts the full `ThreadTrigger` and `AppContent` unions (including
 * `kind: 'stina'` triggers). `source` is optional; defaults to
 * `{ extension_id: RUNTIME_EXTENSION_ID }`.
 */
export interface EmitEventInternalInput {
  trigger: ThreadTrigger
  content: AppContent
  source?: { extension_id?: string; component?: string }
  /** Optional title override; falls back to deriveTitleFromAppContent(content). */
  title?: string
}

export async function createServer(options: ServerOptions): Promise<{
  app: FastifyInstance
  emitEventInternal: (input: EmitEventInternalInput) => Promise<{ thread_id: string }>
  notificationDispatcher: import('@stina/orchestrator').NotificationDispatcher
}> {
  const logger = options.logger ?? createConsoleLogger(getLogLevelFromEnv())

  // One degraded-mode tracker per server instance (§04 lines 147–157). In-memory;
  // a restart resets it (v1 known limitation). Single-keyed — v1 is single-user.
  const degradedModeTracker = new DegradedModeTracker()

  // One notification dispatcher per server instance. In-memory; restart resets
  // state (acceptable for v1 — matches DegradedModeTracker pattern). Clients
  // catch up via GET /notifications on reconnect. Events fired during a brief
  // disconnect are lost (no buffering in v1).
  const notificationDispatcher = new NotificationDispatcher()

  // Early marker check — must happen before initDatabase so no subsystems
  // initialize if a previous migration run was interrupted.
  const markerPath = path.join(getAppDataDir(), 'migration-in-progress')
  if (fs.existsSync(markerPath)) {
    const marker = readMigrationMarker(markerPath)
    const lines = [
      'FATAL: Migration was interrupted in a previous run — Stina cannot start safely.',
      `  Marker file:   ${markerPath}`,
      `  Phase reached: ${marker?.phase ?? 'unknown'}`,
      `  Started:       ${marker?.started_at ? new Date(marker.started_at).toISOString() : 'unknown'}`,
      `  Backup path:   ${marker?.backup_path ?? '(unavailable)'}`,
      '',
      'Recovery options:',
      '  1. Resume:  Delete the marker file and restart the server.',
      `  2. Restore: Reinstall version ${marker?.source_version ?? '(see marker file)'} and run:`,
      `               stina-restore "${marker?.backup_path ?? '<backup-path>'}"`,
      '  3. Contact: Keep the marker file and contact support.',
    ]
    logger.error(lines.join('\n'))
    process.exit(1)
  }

  const fastify = Fastify({
    logger: false, // We use our own logger
  })

  // Register CORS — configurable via STINA_CORS_ORIGIN env variable
  const corsOriginEnv = process.env['STINA_CORS_ORIGIN']
  const corsOrigin: boolean | string | string[] = corsOriginEnv
    ? corsOriginEnv.includes(',')
      ? corsOriginEnv.split(',').map((o) => o.trim())
      : corsOriginEnv === '*'
        ? true
        : corsOriginEnv
    : true // default: allow all origins for local development
  await fastify.register(cors, {
    origin: corsOrigin,
  })

  // Register multipart for file uploads
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  })

  // Initialize database with migrations (including auth + redesign-2026 packages)
  const db = initDatabase({
    logger,
    migrations: [
      getChatMigrationsPath(),
      getSchedulerMigrationsPath(),
      getAuthMigrationsPath(),
      // redesign-2026 packages — see docs/redesign-2026/08-migration.md
      getThreadsMigrationsPath(),
      getMemoryMigrationsPath(),
      getAutonomyMigrationsPath(),
    ],
  })

  // §08 legacy-thread migration — runs once, no-op on fresh installs and re-runs
  const rawDb = getRawDb()
  if (rawDb) {
    runMigrationIfNeeded(rawDb, {
      backupDir: path.join(getAppDataDir(), 'backups'),
      markerPath,
      sourceVersion: 'v0.5.0', // keep in sync with apps/api/package.json version
      logger,
    })
  }

  // Initialize auth repositories
  const userRepository = new UserRepository(db)
  const passkeyCredentialRepository = new PasskeyCredentialRepository(db)
  const refreshTokenRepository = new RefreshTokenRepository(db)
  const authConfigRepository = new AuthConfigRepository(db)
  const invitationRepository = new InvitationRepository(db)

  // Get RP config from database (set during initial setup)
  const rpId = await authConfigRepository.getRpId()
  const rpOrigin = await authConfigRepository.getRpOrigin()

  // Get or generate token secrets
  let accessTokenSecret =
    process.env['AUTH_ACCESS_TOKEN_SECRET'] ?? (await authConfigRepository.getAccessTokenSecret())
  let refreshTokenSecret =
    process.env['AUTH_REFRESH_TOKEN_SECRET'] ?? (await authConfigRepository.getRefreshTokenSecret())

  // Generate and store secrets if not set
  if (!accessTokenSecret) {
    accessTokenSecret = TokenService.generateSecret()
    await authConfigRepository.setAccessTokenSecret(accessTokenSecret)
    logger.info('Generated and stored new access token secret')
  }
  if (!refreshTokenSecret) {
    refreshTokenSecret = TokenService.generateSecret()
    await authConfigRepository.setRefreshTokenSecret(refreshTokenSecret)
    logger.info('Generated and stored new refresh token secret')
  }

  // Initialize auth services
  const tokenService = new TokenService({
    accessTokenSecret,
    refreshTokenSecret,
  })

  // Build list of allowed origins for WebAuthn
  // Include Electron dev port (3003) alongside configured origin
  const allowedOrigins: string[] = []
  if (rpOrigin) {
    allowedOrigins.push(rpOrigin)
    // If the origin is localhost, also allow the Electron dev port
    try {
      const originUrl = new URL(rpOrigin)
      if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
        // Add common Electron dev port
        allowedOrigins.push(`${originUrl.protocol}//localhost:3003`)
      }
    } catch {
      // Invalid URL, just use the origin as-is
    }
  } else {
    allowedOrigins.push('http://localhost:3000')
  }

  const passkeyService = new PasskeyService({
    rpId: rpId ?? 'localhost',
    origin:
      allowedOrigins.length === 1
        ? (allowedOrigins[0] ?? 'http://localhost:3000')
        : allowedOrigins,
  })

  const authService = new AuthService(
    userRepository,
    passkeyCredentialRepository,
    refreshTokenRepository,
    authConfigRepository,
    invitationRepository,
    tokenService,
    passkeyService
  )

  // Initialize Electron auth service for external browser authentication
  const electronAuthService = new ElectronAuthService(
    tokenService,
    userRepository,
    refreshTokenRepository
  )

  // Register auth plugin
  await fastify.register(authPlugin, {
    authService,
    requireAuth: options.requireAuth ?? true,
    defaultUserId: options.defaultUserId,
  })

  const chatDb = asChatDb(db)

  // Initialize settings store for local mode (with default user)
  // In multi-user mode, settings are fetched per-request via UserSettingsRepository
  if (options.defaultUserId) {
    await initAppSettingsStore(chatDb, options.defaultUserId)
  }

  const scheduler = new SchedulerService({
    db,
    logger,
    onFire: (event) => {
      if (event.emit) {
        // Emit-shorthand path: skip the extension onFire handler and spawn a
        // typed thread directly. Visible audit signal so authors who accidentally
        // register both an emit-shorthand job AND an onFire handler can see the
        // override in the logs.
        logger.info('scheduler: emit-shorthand path; skipping extension onFire', {
          extensionId: event.extensionId,
          jobId: event.payload.id,
        })

        // onFire is synchronous (returns boolean); emitEventInternal is async.
        // void + .catch is the only shape that fits without widening the
        // SchedulerService callback signature. The decision turn's I/O
        // progresses on the microtask queue; the scheduler tick is unaffected.
        // Source is intentionally omitted — emitEventInternal defaults to
        // RUNTIME_EXTENSION_ID, which is the correct audit semantic: the runtime
        // is the emitter; the extension is configurator. Audit trail of "which
        // extension scheduled this" lives in the scheduler row's extensionId.
        void emitEventInternal({
          trigger: { kind: 'scheduled', job_id: event.payload.id },
          content: {
            kind: 'scheduled',
            job_id: event.payload.id,
            description: event.emit.description,
            ...(event.emit.payload ? { payload: event.emit.payload } : {}),
          },
        }).catch((err) => {
          logger.warn('scheduler emitEvent failed', {
            extensionId: event.extensionId,
            jobId: event.payload.id,
            error: err instanceof Error ? err.message : String(err),
          })
        })
        return true
      }

      // Legacy path: notify the extension worker's onFire handler.
      const extensionHost = getExtensionHost()
      if (!extensionHost) return false

      const extension = extensionHost.getExtension(event.extensionId)
      if (!extension) return false

      extensionHost.notifySchedulerFire(event.extensionId, event.payload)
      return true
    },
  })

  // Setup the severity-change cascade callback (§06).
  // The snapshot repo uses the same DB as the other autonomy repos.
  // emitEventInternal is defined later in this function; we use a late-bound
  // reference via a mutable variable populated before any tool is observed
  // (tools are observed after setupExtensions completes).
  const snapshotRepo = new ToolSeveritySnapshotRepository(asAutonomyDb(getDatabase()))
  let emitEventInternalRef: ((input: EmitEventInternalInput) => Promise<{ thread_id: string }>) | null = null

  const onToolSeverityObserved = async ({
    extensionId,
    toolId,
    severity: rawSeverity,
  }: {
    extensionId: string
    toolId: string
    severity: import('@stina/core').ToolSeverity | undefined
  }) => {
    // Resolve undefined → 'medium', matching the producer's ?? 'medium' gate.
    const resolved: import('@stina/core').ToolSeverity = rawSeverity ?? 'medium'

    const result = await snapshotRepo.compare(extensionId, toolId, resolved)

    if (!result.didChange) {
      // First load OR same severity as last time — persist snapshot so
      // subsequent loads can detect changes. No cascade needed.
      await snapshotRepo.recordSeen(extensionId, toolId, resolved)
      return
    }

    if (!emitEventInternalRef) {
      logger.warn('onToolSeverityObserved: emitEventInternal not yet available — skipping cascade', {
        extensionId,
        toolId,
      })
      return
    }

    // result.previous !== null AND severity changed.
    const drizzleDb = getDatabase()
    const policyRepo = new AutoPolicyRepository(asAutonomyDb(drizzleDb))
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(drizzleDb))

    await applySeverityChangeCascade(
      { db: asAutonomyDb(drizzleDb), policyRepo, activityLogRepo, emitEventInternal: emitEventInternalRef, logger },
      { extensionId, toolId, previous: result.previous!, current: result.current }
    )

    // Persist the new snapshot AFTER the cascade succeeds (at-least-once
    // semantics: crash between cascade and recordSeen causes a re-run on
    // next boot; acceptable per brief rationale).
    await snapshotRepo.recordSeen(extensionId, toolId, resolved)
  }

  // Setup extensions and themes (async to load provider extensions)
  await setupExtensions(logger, {
    scheduler: {
      schedule: async (extensionId, job) => scheduler.schedule(extensionId, job),
      cancel: async (extensionId, jobId) => scheduler.cancel(extensionId, jobId),
      updateJobResult: async (extensionId, jobId, success, error) => {
        scheduler.updateJobResult(extensionId, jobId, success, error)
      },
    },
    chat: {
      appendInstruction: async (_extensionId, message) => {
        const userId = message.userId ?? options.defaultUserId
        if (!userId) {
          logger.warn(
            'appendInstruction called but no userId provided and no defaultUserId configured'
          )
          return
        }

        // Queue the instruction through the session manager
        // This will stream to connected clients if they have an active SSE connection
        const result = await queueInstructionForUser(
          userId,
          message.text,
          message.conversationId,
          logger
        )

        if (!result.queued) {
          logger.warn('Failed to queue instruction message', { userId })
        }
      },
    },
    user: {
      listIds: async () => {
        const allUsers = await userRepository.list()
        return allUsers.map((u) => u.id)
      },
    },
    onToolSeverityObserved,
    emitThreadEvent: async (input) => {
      // v1 user resolution: prefer defaultUserId when configured. Otherwise
      // fall back to the only user in the DB (Stina is local-first single-
      // user; this matches apps/electron's defaultUser pattern). Multi-user
      // resolution remains explicitly deferred — if more than one user
      // exists and no default is set, throw a clear error.
      let userId = options.defaultUserId
      if (!userId) {
        const allUsers = await userRepository.list()
        if (allUsers.length === 1) {
          userId = allUsers[0]!.id
        } else if (allUsers.length === 0) {
          throw new Error('emitEvent: no users in the database — cannot resolve event owner')
        } else {
          throw new Error(
            `emitEvent: ${allUsers.length} users found and no defaultUserId configured; multi-user resolution is not implemented in Phase 8a`
          )
        }
      }

      const rawDb = getDatabase()
      const repo = new ThreadRepository(asThreadsDb(rawDb))
      const memoryLoader = new DefaultMemoryContextLoader(
        new StandingInstructionRepository(asMemoryDb(rawDb)),
        new ProfileFactRepository(asMemoryDb(rawDb)),
        getRecallProviderRegistry(),
        logger
      )
      const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
      const producer = await buildRedesignDecisionTurnProducer({
        extensionHost: getExtensionHost(),
        userId,
        logger,
      })

      return spawnTriggeredThread(
        { threadRepo: repo, activityLogRepo, memoryLoader, ...(producer ? { producer } : {}), logger, tracker: degradedModeTracker, notificationDispatcher, notifyUserId: userId },
        { trigger: input.trigger, content: input.content, source: input.source }
      )
    },
  })

  scheduler.start()

  // Periodically remove old completed (disabled) scheduled jobs based on
  // each user's retention preference (AppSettingsDTO.scheduledJobsRetentionDays).
  const schedulerRepository = new SchedulerRepository(db)
  const schedulerCleanup = new SchedulerCleanupService({
    repository: schedulerRepository,
    logger,
    getRetentionDays: async (userId) => {
      const userSettingsRepo = new UserSettingsRepository(chatDb, userId)
      return userSettingsRepo.getValue('scheduledJobsRetentionDays')
    },
  })
  schedulerCleanup.start()

  fastify.addHook('onClose', async () => {
    schedulerCleanup.stop()
  })

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(systemRoutes)
  await fastify.register(helloRoutes)
  await fastify.register(themeRoutes)
  await fastify.register(extensionRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(chatStreamRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(toolsRoutes)
  await fastify.register(scheduledJobsRoutes)
  // redesign-2026 — see docs/redesign-2026/04-event-flow.md
  await fastify.register(threadRoutes, {
    getDecisionTurnProducer: (userId) =>
      buildRedesignDecisionTurnProducer({
        extensionHost: getExtensionHost(),
        userId,
        logger,
      }),
  })
  await fastify.register(notificationRoutes, { notificationDispatcher })
  await fastify.register(activityRoutes)
  await fastify.register(policyRoutes)
  await fastify.register(createAuthRoutes(authService))
  await fastify.register(createElectronAuthRoutes(authService, electronAuthService))

  if (process.env['STINA_E2E'] === 'true') {
    const { createE2ESessionRoutes } = await import('./routes/e2e-session.js')
    await fastify.register(createE2ESessionRoutes({ userRepository, tokenService, refreshTokenRepository }))
  }

  /**
   * Runtime-only API for spawning triggered threads from host code (§04 line 49 /
   * acceptance line 204). Accepts the full `ThreadTrigger` and `AppContent` unions.
   * Defaults `source.extension_id` to `RUNTIME_EXTENSION_ID` when not provided.
   * Thin wrapper around `spawnTriggeredThread` — lifecycle identical to the public path.
   */
  const emitEventInternal = async (input: EmitEventInternalInput): Promise<{ thread_id: string }> => {
    let userId = options.defaultUserId
    if (!userId) {
      const allUsers = await userRepository.list()
      if (allUsers.length === 1) {
        userId = allUsers[0]!.id
      } else if (allUsers.length === 0) {
        throw new Error('emitEventInternal: no users in the database — cannot resolve event owner')
      } else {
        throw new Error(
          `emitEventInternal: ${allUsers.length} users found and no defaultUserId configured`
        )
      }
    }

    const rawDb = getDatabase()
    const repo = new ThreadRepository(asThreadsDb(rawDb))
    const memoryLoader = new DefaultMemoryContextLoader(
      new StandingInstructionRepository(asMemoryDb(rawDb)),
      new ProfileFactRepository(asMemoryDb(rawDb)),
      getRecallProviderRegistry(),
      logger
    )
    const activityLogRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
    const producer = await buildRedesignDecisionTurnProducer({
      extensionHost: getExtensionHost(),
      userId,
      logger,
    })

    const source = {
      extension_id: input.source?.extension_id ?? RUNTIME_EXTENSION_ID,
      ...(input.source?.component ? { component: input.source.component } : {}),
    }

    return spawnTriggeredThread(
      { threadRepo: repo, activityLogRepo, memoryLoader, ...(producer ? { producer } : {}), logger, tracker: degradedModeTracker, notificationDispatcher, notifyUserId: userId },
      { trigger: input.trigger, content: input.content, source, ...(input.title !== undefined ? { title: input.title } : {}) }
    )
  }

  // Publish emitEventInternal to the late-bound reference used by the
  // onToolSeverityObserved cascade callback (defined above).
  emitEventInternalRef = emitEventInternal

  return { app: fastify, emitEventInternal, notificationDispatcher }
}
