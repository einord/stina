import type { FastifyPluginAsync } from 'fastify'
import type { ServerTimeResponse } from '@stina/shared'
import { UserSettingsRepository } from '@stina/chat/db'
import { getDatabase } from '@stina/adapters-node'
import { asChatDb } from '../asChatDb.js'
import { requireAuth } from '@stina/auth'
import { getUserId } from './auth-helpers.js'

/**
 * Compute the UTC offset in minutes for a given IANA timezone at a specific date.
 */
function getUtcOffsetMinutesForTimeZone(timeZone: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzStr = date.toLocaleString('en-US', { timeZone })
  return (new Date(utcStr).getTime() - new Date(tzStr).getTime()) / 60_000
}

/**
 * Format a Date as an ISO 8601 string with the timezone offset for the given IANA timezone.
 */
function toIsoWithTimeZone(date: Date, timeZone: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const offsetMinutes = getUtcOffsetMinutesForTimeZone(timeZone, date)
  const sign = offsetMinutes <= 0 ? '+' : '-'
  const absOffset = Math.abs(offsetMinutes)
  const offH = pad(Math.floor(absOffset / 60))
  const offM = pad(absOffset % 60)
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${sign}${offH}:${offM}`
}

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
