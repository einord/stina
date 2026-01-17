import type { FastifyPluginAsync } from 'fastify'
import { requireAuth, requireAdmin } from '@stina/auth'
import type { AuthService, User } from '@stina/auth'

/**
 * Auth routes factory
 */
export function createAuthRoutes(authService: AuthService): FastifyPluginAsync {
  return async (fastify) => {
    // ========================================
    // Setup
    // ========================================

    /**
     * Check setup status
     * GET /auth/setup/status
     */
    fastify.get<{
      Reply: { isFirstUser: boolean; setupCompleted: boolean }
    }>('/auth/setup/status', async () => {
      const [isFirstUser, setupCompleted] = await Promise.all([
        authService.isFirstUser(),
        authService.isSetupCompleted(),
      ])
      return { isFirstUser, setupCompleted }
    })

    /**
     * Complete setup with RP configuration
     * POST /auth/setup/complete
     */
    fastify.post<{
      Body: { rpId: string; rpOrigin: string }
      Reply: { success: boolean } | { error: string }
    }>('/auth/setup/complete', async (request, reply) => {
      const setupCompleted = await authService.isSetupCompleted()
      if (setupCompleted) {
        reply.code(400)
        return { error: 'Setup already completed' }
      }

      await authService.completeSetup(request.body.rpId, request.body.rpOrigin)
      return { success: true }
    })

    // ========================================
    // Registration
    // ========================================

    /**
     * Start passkey registration
     * POST /auth/register/options
     */
    fastify.post<{
      Body: { username: string; displayName?: string; invitationToken?: string }
      Reply: { options: unknown; isFirstUser: boolean } | { error: string }
    }>('/auth/register/options', async (request, reply) => {
      try {
        const result = await authService.generateRegistrationOptions({
          username: request.body.username,
          displayName: request.body.displayName,
          invitationToken: request.body.invitationToken,
        })
        return result
      } catch (error) {
        reply.code(400)
        return { error: error instanceof Error ? error.message : 'Registration failed' }
      }
    })

    /**
     * Verify passkey registration
     * POST /auth/register/verify
     */
    fastify.post<{
      Body: { username: string; credential: unknown; invitationToken?: string }
      Reply: { user: User; tokens: { accessToken: string; refreshToken: string } } | { error: string }
    }>('/auth/register/verify', async (request, reply) => {
      const result = await authService.verifyRegistration({
        username: request.body.username,
        credential: request.body.credential,
        invitationToken: request.body.invitationToken,
      })

      if (!result.success || !result.user || !result.tokens) {
        reply.code(400)
        return { error: result.error ?? 'Registration verification failed' }
      }

      return { user: result.user, tokens: result.tokens }
    })

    // ========================================
    // Authentication
    // ========================================

    /**
     * Start passkey authentication
     * POST /auth/login/options
     */
    fastify.post<{
      Body: { username?: string }
      Reply: unknown
    }>('/auth/login/options', async (request) => {
      return authService.generateAuthenticationOptions({
        username: request.body.username,
      })
    })

    /**
     * Verify passkey authentication
     * POST /auth/login/verify
     */
    fastify.post<{
      Body: { credential: unknown; deviceInfo?: { userAgent?: string; ip?: string } }
      Reply: { user: User; tokens: { accessToken: string; refreshToken: string } } | { error: string }
    }>('/auth/login/verify', async (request, reply) => {
      const result = await authService.verifyAuthentication({
        credential: request.body.credential,
        deviceInfo: request.body.deviceInfo,
      })

      if (!result.success || !result.user || !result.tokens) {
        reply.code(401)
        return { error: result.error ?? 'Authentication failed' }
      }

      return { user: result.user, tokens: result.tokens }
    })

    // ========================================
    // Token Management
    // ========================================

    /**
     * Refresh access token
     * POST /auth/refresh
     */
    fastify.post<{
      Body: { refreshToken: string }
      Reply: { user: User; tokens: { accessToken: string; refreshToken: string } } | { error: string }
    }>('/auth/refresh', async (request, reply) => {
      const result = await authService.refreshAccessToken(request.body.refreshToken)

      if (!result.success || !result.user || !result.tokens) {
        reply.code(401)
        return { error: result.error ?? 'Token refresh failed' }
      }

      return { user: result.user, tokens: result.tokens }
    })

    /**
     * Logout (revoke refresh token)
     * POST /auth/logout
     */
    fastify.post<{
      Body: { refreshToken: string }
      Reply: { success: boolean }
    }>('/auth/logout', { preHandler: requireAuth }, async (request) => {
      await authService.revokeRefreshToken(request.body.refreshToken)
      return { success: true }
    })

    // ========================================
    // User Profile
    // ========================================

    /**
     * Get current user
     * GET /auth/me
     */
    fastify.get<{
      Reply: User | { error: string }
    }>('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
      const user = await authService.getUserById(request.user!.id)
      if (!user) {
        reply.code(404)
        return { error: 'User not found' }
      }
      return user
    })

    // ========================================
    // Admin: User Management
    // ========================================

    /**
     * List all users (admin only)
     * GET /auth/users
     */
    fastify.get<{
      Reply: User[]
    }>('/auth/users', { preHandler: requireAdmin }, async () => {
      return authService.listUsers()
    })

    /**
     * Update user role (admin only)
     * PUT /auth/users/:id/role
     */
    fastify.put<{
      Params: { id: string }
      Body: { role: 'admin' | 'user' }
      Reply: User | { error: string }
    }>('/auth/users/:id/role', { preHandler: requireAdmin }, async (request, reply) => {
      const user = await authService.updateUserRole(request.params.id, request.body.role)
      if (!user) {
        reply.code(404)
        return { error: 'User not found' }
      }
      return user
    })

    /**
     * Delete user (admin only)
     * DELETE /auth/users/:id
     */
    fastify.delete<{
      Params: { id: string }
      Reply: { success: boolean } | { error: string }
    }>('/auth/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
      // Prevent self-deletion
      if (request.user!.id === request.params.id) {
        reply.code(400)
        return { error: 'Cannot delete yourself' }
      }

      await authService.deleteUser(request.params.id)
      return { success: true }
    })

    // ========================================
    // Admin: Invitations
    // ========================================

    /**
     * Create invitation (admin only)
     * POST /auth/users/invite
     */
    fastify.post<{
      Body: { username: string; role?: 'admin' | 'user' }
      Reply: { token: string; expiresAt: Date } | { error: string }
    }>('/auth/users/invite', { preHandler: requireAdmin }, async (request, reply) => {
      try {
        const invitation = await authService.createInvitation(request.user!.id, {
          username: request.body.username,
          role: request.body.role,
        })
        return { token: invitation.token, expiresAt: invitation.expiresAt }
      } catch (error) {
        reply.code(400)
        return { error: error instanceof Error ? error.message : 'Failed to create invitation' }
      }
    })

    /**
     * Get pending invitations (admin only)
     * GET /auth/invitations
     */
    fastify.get<{
      Reply: Array<{
        id: string
        username: string
        role: 'admin' | 'user'
        token: string
        expiresAt: Date
        createdAt: Date
      }>
    }>('/auth/invitations', { preHandler: requireAdmin }, async () => {
      return authService.getPendingInvitations()
    })

    /**
     * Validate invitation token (public)
     * GET /auth/invitations/:token
     */
    fastify.get<{
      Params: { token: string }
      Reply: { valid: boolean; username?: string; role?: 'admin' | 'user' } | { error: string }
    }>('/auth/invitations/:token', async (request) => {
      const invitation = await authService.getInvitationByToken(request.params.token)
      if (!invitation) {
        return { valid: false }
      }
      return { valid: true, username: invitation.username, role: invitation.role }
    })

    /**
     * Delete invitation (admin only)
     * DELETE /auth/invitations/:id
     */
    fastify.delete<{
      Params: { id: string }
      Reply: { success: boolean }
    }>('/auth/invitations/:id', { preHandler: requireAdmin }, async (request) => {
      await authService.deleteInvitation(request.params.id)
      return { success: true }
    })
  }
}
