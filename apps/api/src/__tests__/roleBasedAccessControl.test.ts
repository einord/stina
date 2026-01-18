import { describe, it, expect } from 'vitest'
import { requireAuth, requireAdmin, requireRole } from '@stina/auth'
import type { FastifyRequest, FastifyReply } from 'fastify'

/**
 * Creates a mock Fastify request object
 */
function createMockRequest(
  overrides: Partial<{
    isAuthenticated: boolean
    user: { id: string; role: 'admin' | 'user'; username: string }
  }> = {}
): FastifyRequest {
  return {
    isAuthenticated: overrides.isAuthenticated ?? false,
    user: overrides.user,
  } as unknown as FastifyRequest
}

/**
 * Creates a mock Fastify reply object
 */
function createMockReply(): FastifyReply & {
  statusCode: number
  sentData: unknown
} {
  let statusCode = 200
  let sentData: unknown = null

  const reply = {
    get statusCode() {
      return statusCode
    },
    get sentData() {
      return sentData
    },
    code(code: number) {
      statusCode = code
      return reply
    },
    send(data: unknown) {
      sentData = data
      return reply
    },
  }

  return reply as unknown as FastifyReply & { statusCode: number; sentData: unknown }
}

/**
 * Helper to call a preHandler with mock done callback
 */
async function callPreHandler(
  handler: (request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => void | Promise<void>,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const done = () => {}
  await handler(request, reply, done)
}

describe('Role-Based Access Control', () => {
  describe('requireAuth middleware', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const request = createMockRequest({ isAuthenticated: false })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      expect(reply.statusCode).toBe(401)
      expect(reply.sentData).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      })
    })

    it('should return 401 when isAuthenticated is true but user is missing', async () => {
      const request = createMockRequest({ isAuthenticated: true, user: undefined })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      expect(reply.statusCode).toBe(401)
    })

    it('should allow authenticated requests with user object', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      // No response sent means the request was allowed through
      expect(reply.sentData).toBeNull()
      expect(reply.statusCode).toBe(200)
    })

    it('should allow admin users', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      expect(reply.sentData).toBeNull()
      expect(reply.statusCode).toBe(200)
    })
  })

  describe('requireAdmin middleware', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const request = createMockRequest({ isAuthenticated: false })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(401)
      expect(reply.sentData).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      })
    })

    it('should return 403 for non-admin users', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.sentData).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      })
    })

    it('should allow admin users', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.sentData).toBeNull()
      expect(reply.statusCode).toBe(200)
    })
  })

  describe('requireRole middleware', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const middleware = requireRole('admin')
      const request = createMockRequest({ isAuthenticated: false })
      const reply = createMockReply()

      await callPreHandler(middleware, request, reply)

      expect(reply.statusCode).toBe(401)
    })

    it('should return 403 when user lacks required role', async () => {
      const middleware = requireRole('admin')
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(middleware, request, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.sentData).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'admin access required',
        },
      })
    })

    it('should allow users with exact role match', async () => {
      const middleware = requireRole('user')
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(middleware, request, reply)

      expect(reply.sentData).toBeNull()
      expect(reply.statusCode).toBe(200)
    })

    it('should always allow admin users regardless of required role', async () => {
      const middleware = requireRole('user')
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(middleware, request, reply)

      expect(reply.sentData).toBeNull()
      expect(reply.statusCode).toBe(200)
    })
  })

  describe('Extension endpoints protection', () => {
    // These tests verify the expected behavior based on route configuration
    // The actual routes use requireAdmin for these endpoints

    it('POST /extensions/install should require admin - verified by middleware', async () => {
      // Non-admin trying to install extension
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.sentData).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      })
    })

    it('DELETE /extensions/:id should require admin - verified by middleware', async () => {
      // Non-admin trying to uninstall extension
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
    })

    it('should allow admin to install extensions', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(200)
      expect(reply.sentData).toBeNull()
    })
  })

  describe('Model config endpoints protection', () => {
    it('POST /settings/ai/models should require admin - verified by middleware', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
    })

    it('PUT /settings/ai/models/:id should require admin - verified by middleware', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
    })

    it('DELETE /settings/ai/models/:id should require admin - verified by middleware', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
    })

    it('GET /settings/ai/models should only require auth (not admin) - verified by middleware', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      // Regular user should be allowed to read models
      expect(reply.statusCode).toBe(200)
      expect(reply.sentData).toBeNull()
    })

    it('should allow admin to create model configs', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(200)
      expect(reply.sentData).toBeNull()
    })
  })

  describe('Invitation endpoints protection', () => {
    it('POST /auth/users/invite should require admin - verified by middleware', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(403)
      expect(reply.sentData).toEqual({
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      })
    })

    it('should allow admin to create invitations', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'admin-1', role: 'admin', username: 'admin' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.statusCode).toBe(200)
      expect(reply.sentData).toBeNull()
    })
  })

  describe('Error response format', () => {
    it('should return consistent error format for 401', async () => {
      const request = createMockRequest({ isAuthenticated: false })
      const reply = createMockReply()

      await callPreHandler(requireAuth, request, reply)

      expect(reply.sentData).toHaveProperty('error')
      expect(reply.sentData).toHaveProperty('error.code', 'UNAUTHORIZED')
      expect(reply.sentData).toHaveProperty('error.message')
    })

    it('should return consistent error format for 403', async () => {
      const request = createMockRequest({
        isAuthenticated: true,
        user: { id: 'user-1', role: 'user', username: 'testuser' },
      })
      const reply = createMockReply()

      await callPreHandler(requireAdmin, request, reply)

      expect(reply.sentData).toHaveProperty('error')
      expect(reply.sentData).toHaveProperty('error.code', 'FORBIDDEN')
      expect(reply.sentData).toHaveProperty('error.message')
    })
  })
})
