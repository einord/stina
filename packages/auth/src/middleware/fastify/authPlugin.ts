import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { AuthService } from '../../services/AuthService.js'
import type { User } from '../../types/user.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** The authenticated user, or null if not authenticated */
    user: User | null
    /** Whether the request is authenticated */
    isAuthenticated: boolean
  }
  interface FastifyInstance {
    /** The auth service instance */
    authService: AuthService
  }
}

/**
 * Options for the auth plugin
 */
export interface AuthPluginOptions {
  /** The auth service instance */
  authService: AuthService
  /** Whether authentication is required (false for local mode) */
  requireAuth: boolean
  /** Default user ID for local mode (when requireAuth is false) */
  defaultUserId?: string
}

/**
 * Fastify plugin for authentication.
 *
 * This plugin:
 * - Decorates the Fastify instance with the auth service
 * - Decorates each request with `user` and `isAuthenticated`
 * - Extracts and verifies JWT from Authorization header
 * - In local mode (requireAuth=false), uses a default user
 */
const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (fastify, options) => {
  const { authService, requireAuth, defaultUserId } = options

  // Decorate Fastify instance with auth service
  fastify.decorate('authService', authService)

  // Decorate requests with user and isAuthenticated
  fastify.decorateRequest('user', null)
  fastify.decorateRequest('isAuthenticated', false)

  // Add hook to extract and verify user on each request
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    // Local mode: use default user
    if (!requireAuth && defaultUserId) {
      const user = await authService.getUserById(defaultUserId)
      request.user = user
      request.isAuthenticated = !!user
      return
    }

    // Extract JWT from Authorization header or query parameter (for SSE/EventSource)
    const authHeader = request.headers.authorization
    const queryToken = (request.query as Record<string, unknown>)?.['token'] as string | undefined

    let token: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    } else if (queryToken) {
      // Support token via query param for EventSource (SSE) which doesn't support custom headers
      token = queryToken
    }

    if (!token) {
      request.user = null
      request.isAuthenticated = false
      return
    }

    try {
      const payload = await authService.verifyAccessToken(token)
      const user = await authService.getUserById(payload.sub)
      request.user = user
      request.isAuthenticated = !!user
    } catch {
      request.user = null
      request.isAuthenticated = false
    }
  })
}

/**
 * Fastify auth plugin wrapped with fastify-plugin
 */
export const authPlugin = fp(authPluginImpl, {
  name: '@stina/auth',
  fastify: '4.x',
})
