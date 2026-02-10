import type { FastifyRequest } from 'fastify'

/**
 * Extract the authenticated user's ID from the request.
 * Throws a 401-style error if authentication is missing.
 */
export function getUserId(request: FastifyRequest): string {
  if (!request.user?.id) {
    const error = new Error('Authentication required') as Error & { statusCode: number }
    error.statusCode = 401
    throw error
  }
  return request.user.id
}
