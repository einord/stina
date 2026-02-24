import Fastify from 'fastify'
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
import { setupExtensions, getExtensionHost } from './setup.js'
import { initDatabase, createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
import {
  initAppSettingsStore,
  getChatMigrationsPath,
} from '@stina/chat/db'
import { asChatDb } from './asChatDb.js'
import { SchedulerService, getSchedulerMigrationsPath } from '@stina/scheduler'
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

export async function createServer(options: ServerOptions) {
  const logger = options.logger ?? createConsoleLogger(getLogLevelFromEnv())

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

  // Initialize database with migrations (including auth)
  const db = initDatabase({
    logger,
    migrations: [getChatMigrationsPath(), getSchedulerMigrationsPath(), getAuthMigrationsPath()],
  })

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
      const extensionHost = getExtensionHost()
      if (!extensionHost) return false

      const extension = extensionHost.getExtension(event.extensionId)
      if (!extension) return false

      extensionHost.notifySchedulerFire(event.extensionId, event.payload)
      return true
    },
  })

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
  })

  scheduler.start()

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
  await fastify.register(createAuthRoutes(authService))
  await fastify.register(createElectronAuthRoutes(authService, electronAuthService))

  return fastify
}
