import { createServer } from './server.js'
import { createConsoleLogger, getLogLevelFromEnv } from '@stina/adapters-node'

const PORT = parseInt(process.env['PORT'] || '3001', 10)
const HOST = process.env['HOST'] || '0.0.0.0'

const logger = createConsoleLogger(getLogLevelFromEnv())

async function main() {
  const server = await createServer({ port: PORT, host: HOST, logger })

  try {
    await server.listen({ port: PORT, host: HOST })
    logger.info(`Server listening on http://${HOST}:${PORT}`)
  } catch (err) {
    logger.error('Failed to start server', { error: String(err) })
    process.exit(1)
  }
}

main()
