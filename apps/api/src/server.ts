import Fastify from 'fastify'
import cors from '@fastify/cors'
import { healthRoutes } from './routes/health.js'
import { helloRoutes } from './routes/hello.js'
import { themeRoutes } from './routes/themes.js'
import { extensionRoutes } from './routes/extensions.js'
import { chatRoutes } from './routes/chat.js'
import { chatStreamRoutes } from './routes/chatStream.js'
import { settingsRoutes } from './routes/settings.js'
import { toolsRoutes } from './routes/tools.js'
import { createAuthRoutes } from './routes/auth.js'
import { createElectronAuthRoutes } from './routes/electronAuth.js'
import { setupExtensions, getExtensionHost } from './setup.js'
import { initDatabase, createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
import {
  initAppSettingsStore,
  getAppSettingsStore,
  getChatMigrationsPath,
  ConversationRepository,
  ModelConfigRepository,
  UserSettingsRepository,
} from '@stina/chat/db'
import type { ChatDb } from '@stina/chat/db'
import { SchedulerService, getSchedulerMigrationsPath } from '@stina/scheduler'
import { providerRegistry, toolRegistry, runInstructionMessage } from '@stina/chat'
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

  // Register CORS for web dev
  await fastify.register(cors, {
    origin: true,
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

  // Cast db for chat repositories (compatible but different schema type)
  const chatDb = db as unknown as ChatDb

  // Initialize settings store for local mode (with default user)
  // In multi-user mode, settings are fetched per-request via UserSettingsRepository
  if (options.defaultUserId) {
    await initAppSettingsStore(chatDb, options.defaultUserId)
  }

  // Create repositories only if defaultUserId is provided (local mode)
  // In multi-user mode, repositories are created per-request with the authenticated user's ID
  const _conversationRepo = options.defaultUserId
    ? new ConversationRepository(chatDb, options.defaultUserId)
    : null
  // Model configs are now global (no userId required)
  const modelConfigRepository = new ModelConfigRepository(chatDb)
  const userSettingsRepo = options.defaultUserId
    ? new UserSettingsRepository(chatDb, options.defaultUserId)
    : null
  const settingsStore = getAppSettingsStore()
  const _modelConfigProvider = {
    async getDefault() {
      if (!userSettingsRepo) return null
      const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
      if (!defaultModelId) return null
      const config = await modelConfigRepository.get(defaultModelId)
      if (!config) return null
      return {
        providerId: config.providerId,
        modelId: config.modelId,
        settingsOverride: config.settingsOverride,
      }
    },
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

        const userConversationRepo = new ConversationRepository(chatDb, userId)
        const userSettingsRepo = new UserSettingsRepository(chatDb, userId)
        const userModelConfigProvider = {
          async getDefault() {
            const defaultModelId = await userSettingsRepo.getDefaultModelConfigId()
            if (!defaultModelId) return null
            const config = await modelConfigRepository.get(defaultModelId)
            if (!config) return null
            return {
              providerId: config.providerId,
              modelId: config.modelId,
              settingsOverride: config.settingsOverride,
            }
          },
        }

        await runInstructionMessage(
          {
            repository: userConversationRepo,
            providerRegistry,
            toolRegistry,
            modelConfigProvider: userModelConfigProvider,
            settingsStore,
          },
          {
            text: message.text,
            conversationId: message.conversationId,
          }
        )
      },
    },
  })

  scheduler.start()

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(helloRoutes)
  await fastify.register(themeRoutes)
  await fastify.register(extensionRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(chatStreamRoutes)
  await fastify.register(settingsRoutes)
  await fastify.register(toolsRoutes)
  await fastify.register(createAuthRoutes(authService))
  await fastify.register(createElectronAuthRoutes(authService, electronAuthService))

  return fastify
}
