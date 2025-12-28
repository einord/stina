import Fastify from 'fastify'
import cors from '@fastify/cors'
import { healthRoutes } from './routes/health.js'
import { helloRoutes } from './routes/hello.js'
import { themeRoutes } from './routes/themes.js'
import { extensionRoutes } from './routes/extensions.js'
import { chatRoutes } from './routes/chat.js'
import { chatStreamRoutes } from './routes/chatStream.js'
import { setupExtensions } from './setup.js'
import { initDatabase } from './db.js'
import { createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'
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
  initDatabase(logger)

  // Setup extensions and themes (async to load provider extensions)
  await setupExtensions(logger)

  // Register routes
  await fastify.register(healthRoutes)
  await fastify.register(helloRoutes)
  await fastify.register(themeRoutes)
  await fastify.register(extensionRoutes)
  await fastify.register(chatRoutes)
  await fastify.register(chatStreamRoutes)

  return fastify
}
