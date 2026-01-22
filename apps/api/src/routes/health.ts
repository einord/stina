import type { FastifyPluginAsync } from 'fastify'
import type { HealthResponse } from '@stina/shared'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Read version from root package.json at startup.
 * Handles different runtime environments (local dev, Docker, etc.)
 */
function getAppVersion(): string {
  // Try multiple possible locations for package.json
  const candidates = [
    // From process.cwd() (works in Docker when run from /app)
    path.join(process.cwd(), 'package.json'),
    // Relative to this file (local development)
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../package.json'),
    // Relative to dist folder structure
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../package.json'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8'))
        if (pkg.version) {
          return pkg.version
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  return 'unknown'
}

const appVersion = getAppVersion()

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async () => {
    return { ok: true, version: appVersion }
  })
}
