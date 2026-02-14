import type { FastifyPluginAsync } from 'fastify'
import type { ServerTimeResponse } from '@stina/shared'
import { toIsoWithTimeZone } from '@stina/shared'
import { UserSettingsRepository } from '@stina/chat/db'
import { getDatabase } from '@stina/adapters-node'
import { asChatDb } from '../asChatDb.js'
import { requireAuth } from '@stina/auth'
import { getUserId } from './auth-helpers.js'

/**
 * System routes providing server time and related system information.
 */
export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  const db = asChatDb(getDatabase())

  /**
   * Helper to create a UserSettingsRepository scoped to the authenticated user.
   */
  const getUserSettingsRepository = (userId: string) => new UserSettingsRepository(db, userId)

  /**
   * Get the current server time with timezone and language information.
   * GET /system/time
   */
  fastify.get<{
    Reply: ServerTimeResponse
  }>('/system/time', { preHandler: requireAuth }, async (request) => {
    const userSettingsRepo = getUserSettingsRepository(getUserId(request))
    const settings = await userSettingsRepo.get()
    const { timezone, language } = settings

    const now = new Date()
    const iso = toIsoWithTimeZone(now, timezone)

    return { iso, epochMs: Date.now(), timezone, language }
  })
}
