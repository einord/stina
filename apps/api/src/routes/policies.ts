import type { FastifyPluginAsync } from 'fastify'
import { AutoPolicyRepository, ActivityLogRepository } from '@stina/autonomy/db'
import { StandingInstructionRepository } from '@stina/memory/db'
import { toolRegistry } from '@stina/chat'
import type { AutoPolicy } from '@stina/core'
import { getDatabase } from '@stina/adapters-node'
import { requireAuth } from '@stina/auth'
import { asAutonomyDb, asMemoryDb } from '../asRedesign2026Db.js'

/**
 * Shared validation helper for policy creation.
 * Extracted so both the HTTP route and the Electron IPC handler use
 * identical logic and future rule changes land in one place.
 *
 * Returns a string error message on failure, or null on success.
 */
export async function validatePolicyCreate(
  tool_id: string,
  standing_instruction_id: string | undefined,
  autoPolicyRepo: AutoPolicyRepository,
  standingInstructionRepo: StandingInstructionRepository
): Promise<{ status: 422 | 409; message: string } | null> {
  // 1. Tool must exist in registry
  const tool = toolRegistry.get(tool_id)
  if (!tool) {
    return { status: 422, message: `Unknown tool: ${tool_id}` }
  }

  // 2. Tool must have high severity
  if (tool.severity !== 'high') {
    const sev = tool.severity ?? 'undefined'
    return {
      status: 422,
      message: `Only high-severity tools can have auto-policies (this tool is ${sev})`,
    }
  }

  // 3. If standing_instruction_id provided, it must exist
  if (standing_instruction_id !== undefined && standing_instruction_id !== '') {
    const instruction = await standingInstructionRepo.getById(standing_instruction_id)
    if (!instruction) {
      return {
        status: 422,
        message: `Standing instruction not found: ${standing_instruction_id}`,
      }
    }
  }

  // 4. Duplicate check — same tool_id + same standing_instruction_id (null/undefined treated equal)
  const existing = await autoPolicyRepo.findByTool(tool_id)
  const normalizedNew = standing_instruction_id ?? null
  for (const policy of existing) {
    const normalizedExisting = policy.scope.standing_instruction_id ?? null
    if (normalizedExisting === normalizedNew) {
      return {
        status: 409,
        message: 'A policy for this tool with the same scope already exists',
      }
    }
  }

  return null
}

interface CreatePolicyBody {
  tool_id: string
  standing_instruction_id?: string
}

/**
 * Policy management API — §06 autonomy layer.
 *
 * Routes:
 *   GET  /policies                  List all AutoPolicy rows, newest-first
 *   GET  /policies/available-tools  High-severity tools available for policying
 *   POST /policies                  Create a new AutoPolicy
 *   DELETE /policies/:id            Revoke a policy (+ write memory_change entry)
 */
export const policyRoutes: FastifyPluginAsync = async (fastify) => {
  const rawDb = getDatabase()
  const autoPolicyRepo = new AutoPolicyRepository(asAutonomyDb(rawDb))
  const activityRepo = new ActivityLogRepository(asAutonomyDb(rawDb))
  const standingInstructionRepo = new StandingInstructionRepository(asMemoryDb(rawDb))

  /**
   * List all AutoPolicy rows, ordered newest-first.
   *
   * GET /policies
   */
  fastify.get<{ Reply: AutoPolicy[] | { error: string } }>(
    '/policies',
    { preHandler: requireAuth },
    async () => {
      const all = await autoPolicyRepo.listAll()
      // listAll returns oldest-first; reverse for newest-first UI order
      return all.slice().reverse()
    }
  )

  /**
   * List tools available for policy creation.
   * Only high-severity tools are policy-able (§02).
   *
   * GET /policies/available-tools
   */
  fastify.get<{
    Reply: Array<{ id: string; name: string; severity: 'high' }> | { error: string }
  }>('/policies/available-tools', { preHandler: requireAuth }, async () => {
    return toolRegistry
      .getToolDefinitions()
      .filter((t) => t.severity === 'high')
      .map((t) => ({ id: t.id, name: t.name, severity: 'high' as const }))
  })

  /**
   * Create a new AutoPolicy.
   * Validates: tool exists, severity=high, instruction exists (if given),
   * no duplicate tool+scope.
   *
   * POST /policies
   * Body: { tool_id: string; standing_instruction_id?: string }
   */
  fastify.post<{
    Body: CreatePolicyBody
    Reply: AutoPolicy | { error: string }
  }>('/policies', { preHandler: requireAuth }, async (request, reply) => {
    const { tool_id, standing_instruction_id } = request.body ?? ({} as CreatePolicyBody)

    if (!tool_id || typeof tool_id !== 'string') {
      reply.code(400)
      return { error: 'tool_id is required' }
    }

    const validationError = await validatePolicyCreate(
      tool_id,
      standing_instruction_id,
      autoPolicyRepo,
      standingInstructionRepo
    )
    if (validationError) {
      reply.code(validationError.status)
      return { error: validationError.message }
    }

    const policy = await autoPolicyRepo.create({
      tool_id,
      scope: {
        ...(standing_instruction_id
          ? { standing_instruction_id }
          : {}),
      },
      created_by_suggestion: false,
    })

    reply.code(201)
    return policy
  })

  /**
   * Revoke an AutoPolicy. Writes a memory_change ActivityLogEntry with
   * the policy's tool severity (fallback 'low' if tool no longer registered).
   *
   * DELETE /policies/:id
   */
  fastify.delete<{
    Params: { id: string }
    Reply: { success: boolean } | { error: string }
  }>('/policies/:id', { preHandler: requireAuth }, async (request, reply) => {
    const policy = await autoPolicyRepo.getById(request.params.id)
    if (!policy) {
      reply.code(404)
      return { error: 'Policy not found' }
    }

    const tool = toolRegistry.get(policy.tool_id)
    const resolvedSeverity = tool?.severity ?? 'low'

    await activityRepo.append({
      kind: 'memory_change',
      severity: resolvedSeverity,
      thread_id: null,
      summary: `Auto-policy revoked for tool "${policy.tool_id}"`,
      details: { previous: policy },
    })

    await autoPolicyRepo.revoke(policy.id)

    return { success: true }
  })
}
