import type { FastifyPluginAsync } from 'fastify'
import { SchedulerRepository } from '@stina/scheduler'
import type { ScheduledJobSummaryDTO, ScheduledJobDetailDTO } from '@stina/shared'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { getExtensionHost } from '../setup.js'

/**
 * Generate a human-readable description for a schedule.
 */
function getScheduleDescription(
  scheduleType: 'at' | 'cron' | 'interval',
  scheduleValue: string,
  timezone: string | null
): string {
  switch (scheduleType) {
    case 'at': {
      const date = new Date(scheduleValue)
      if (isNaN(date.getTime())) return `At: ${scheduleValue}`
      return `At: ${date.toLocaleString()}`
    }
    case 'cron': {
      const tzSuffix = timezone ? ` (${timezone})` : ''
      return `Cron: ${scheduleValue}${tzSuffix}`
    }
    case 'interval': {
      const ms = parseInt(scheduleValue, 10)
      if (isNaN(ms)) return `Every: ${scheduleValue}ms`
      if (ms < 1000) return `Every ${ms}ms`
      if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`
      if (ms < 3600000) return `Every ${Math.round(ms / 60000)} minutes`
      if (ms < 86400000) return `Every ${Math.round(ms / 3600000)} hours`
      return `Every ${Math.round(ms / 86400000)} days`
    }
    default:
      return 'Unknown schedule'
  }
}

/**
 * Scheduled jobs routes for viewing and managing scheduled jobs
 */
export const scheduledJobsRoutes: FastifyPluginAsync = async (fastify) => {
  const db = getDatabase()
  const schedulerRepo = new SchedulerRepository(db)

  /**
   * List all scheduled jobs for the authenticated user
   * GET /scheduled-jobs
   */
  fastify.get<{
    Reply: ScheduledJobSummaryDTO[]
  }>('/scheduled-jobs', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id
    const jobs = schedulerRepo.listByUserId(userId)

    return jobs.map((job) => ({
      id: job.id,
      extensionId: job.extensionId,
      jobId: job.jobId,
      userId: job.userId ?? userId,
      scheduleType: job.scheduleType,
      scheduleDescription: getScheduleDescription(job.scheduleType, job.scheduleValue, job.timezone),
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      enabled: job.enabled,
      createdAt: job.createdAt,
    }))
  })

  /**
   * Get a specific scheduled job for the authenticated user
   * GET /scheduled-jobs/:id
   */
  fastify.get<{
    Params: { id: string }
    Reply: ScheduledJobDetailDTO | { error: string }
  }>('/scheduled-jobs/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.user!.id
    const job = schedulerRepo.getByIdForUser(request.params.id, userId)

    if (!job) {
      return reply.status(404).send({ error: 'Job not found' })
    }

    // Get extension name if available
    let extensionName: string | null = null
    const extensionHost = getExtensionHost()
    if (extensionHost) {
      const extension = extensionHost.getExtension(job.extensionId)
      if (extension) {
        extensionName = extension.manifest.name ?? null
      }
    }

    // Parse payload
    let payload: Record<string, unknown> | null = null
    if (job.payloadJson) {
      try {
        payload = JSON.parse(job.payloadJson) as Record<string, unknown>
      } catch {
        // Invalid JSON, leave as null
      }
    }

    return {
      id: job.id,
      extensionId: job.extensionId,
      jobId: job.jobId,
      userId: job.userId ?? userId,
      scheduleType: job.scheduleType,
      scheduleDescription: getScheduleDescription(job.scheduleType, job.scheduleValue, job.timezone),
      scheduleValue: job.scheduleValue,
      timezone: job.timezone,
      misfirePolicy: job.misfirePolicy,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      enabled: job.enabled,
      createdAt: job.createdAt,
      payload,
      extensionName,
    }
  })

  /**
   * Delete a scheduled job for the authenticated user
   * DELETE /scheduled-jobs/:id
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean }
  }>('/scheduled-jobs/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.id
    const deleted = schedulerRepo.delete(request.params.id, userId)
    return { success: deleted }
  })
}
