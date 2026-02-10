import type { FastifyPluginAsync } from 'fastify'
import { SchedulerRepository, getScheduleDescription } from '@stina/scheduler'
import type { ScheduledJobSummaryDTO, ScheduledJobDetailDTO } from '@stina/shared'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { getExtensionHost } from '../setup.js'
import { getUserId } from './auth-helpers.js'

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
    const userId = getUserId(request)
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
    const userId = getUserId(request)
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
    const userId = getUserId(request)
    const deleted = schedulerRepo.delete(request.params.id, userId)
    return { success: deleted }
  })
}
