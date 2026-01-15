import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'

/**
 * Prehandler to require authentication.
 * Returns 401 Unauthorized if the user is not authenticated.
 */
export const requireAuth: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (!request.isAuthenticated || !request.user) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    })
    return
  }
}

/**
 * Prehandler to require admin role.
 * Returns 401 if not authenticated, 403 if not admin.
 */
export const requireAdmin: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  if (!request.isAuthenticated || !request.user) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    })
    return
  }

  if (request.user.role !== 'admin') {
    reply.code(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    })
    return
  }
}

/**
 * Create a prehandler that requires a specific role.
 * Returns 401 if not authenticated, 403 if role doesn't match.
 */
export function requireRole(role: 'admin' | 'user'): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.isAuthenticated || !request.user) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      })
      return
    }

    // Admin can access everything
    if (request.user.role === 'admin') {
      return
    }

    // Check if user has required role
    if (request.user.role !== role) {
      reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: `${role} access required`,
        },
      })
      return
    }
  }
}
