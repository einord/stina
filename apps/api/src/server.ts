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
import { setupExtensions, getExtensionHost } from './setup.js'
import { initDatabase, createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
import { initAppSettingsStore, getChatMigrationsPath, ConversationRepository } from '@stina/chat/db'
import { SchedulerService, getSchedulerMigrationsPath } from '@stina/scheduler'
import { appendInstructionMessage } from '@stina/chat'
import type { Logger } from '@stina/core'

export interface ServerOptions {
  port: number
  host: string
  logger?: Logger
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

  // Initialize database with migrations
  const db = initDatabase({
    logger,
    migrations: [getChatMigrationsPath(), getSchedulerMigrationsPath()],
  })
  await initAppSettingsStore(db)

  const conversationRepo = new ConversationRepository(db)
  const scheduler = new SchedulerService({
    db,
    logger,
    onFire: (event) => {
      const extensionHost = getExtensionHost()
      if (!extensionHost) return
      extensionHost.notifySchedulerFire(event.extensionId, event.payload)
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
        await appendInstructionMessage(conversationRepo, {
          text: message.text,
          conversationId: message.conversationId,
        })
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

  return fastify
}
