/**
 * Scheduler Request Handler
 *
 * Handles scheduler.schedule and scheduler.cancel requests.
 * All scheduled jobs must have a userId - jobs without user context are not allowed.
 */

import type { RequestMethod, SchedulerJobRequest } from '@stina/extension-api'
import type { RequestHandler, HandlerContext } from './ExtensionHost.handlers.js'
import { getPayloadValue, getRequiredString } from './ExtensionHost.handlers.js'
import { validateUserId } from './ExtensionHost.validation.js'

/**
 * Handler for scheduler requests.
 *
 * All scheduled jobs must be associated with a user. The userId is required
 * when scheduling a job and will be passed to the extension when the job fires
 * via ExecutionContext.
 */
export class SchedulerHandler implements RequestHandler {
  readonly methods = ['scheduler.schedule', 'scheduler.cancel', 'scheduler.reportFireResult'] as const

  /**
   * Handle a scheduler request
   * @param ctx Handler context
   * @param method The scheduler method
   * @param payload Request payload
   */
  async handle(ctx: HandlerContext, method: RequestMethod, payload: unknown): Promise<unknown> {
    // Check permission
    const check = ctx.extension.permissionChecker.checkSchedulerAccess()
    if (!check.allowed) {
      throw new Error(check.reason)
    }

    // Verify scheduler is configured
    if (!ctx.options.scheduler) {
      throw new Error('Scheduler not configured')
    }

    switch (method) {
      case 'scheduler.schedule': {
        const job = getPayloadValue<SchedulerJobRequest>(payload, 'job')
        if (!job || typeof job !== 'object') {
          throw new Error('Job payload is required')
        }

        // Validate userId is present and valid
        validateUserId(job.userId)

        await ctx.options.scheduler.schedule(ctx.extensionId, job)
        return undefined
      }

      case 'scheduler.cancel': {
        const jobId = getRequiredString(payload, 'jobId')
        await ctx.options.scheduler.cancel(ctx.extensionId, jobId)
        return undefined
      }

      case 'scheduler.reportFireResult': {
        const jobId = getRequiredString(payload, 'jobId')
        const success = getPayloadValue<boolean>(payload, 'success') ?? false
        const error = getPayloadValue<string>(payload, 'error')
        await ctx.options.scheduler?.updateJobResult(ctx.extensionId, jobId, success, error)
        return undefined
      }

      default:
        throw new Error(`Unknown scheduler method: ${method}`)
    }
  }
}
