import type { FastifyPluginAsync } from 'fastify'
import type { AuthService, ElectronAuthService } from '@stina/auth'

/**
 * Electron authentication routes factory.
 * Implements external browser authentication flow with PKCE.
 *
 * @param authService - Main auth service for WebAuthn operations
 * @param electronAuthService - Service for Electron-specific PKCE flow
 */
export function createElectronAuthRoutes(
  authService: AuthService,
  electronAuthService: ElectronAuthService
): FastifyPluginAsync {
  return async (fastify) => {
    // ========================================
    // Session Creation
    // ========================================

    /**
     * Create a new authentication session.
     * Called by Electron before opening the browser.
     * POST /auth/electron/session
     */
    fastify.post<{
      Body: {
        code_challenge: string
        state: string
      }
      Reply: { session_id: string } | { error: string }
    }>('/auth/electron/session', async (request, reply) => {
      const { code_challenge, state } = request.body

      if (!code_challenge || !state) {
        reply.code(400)
        return { error: 'Missing required parameters: code_challenge and state' }
      }

      const sessionId = electronAuthService.createSession(code_challenge, state)
      return { session_id: sessionId }
    })

    // ========================================
    // WebAuthn Verification
    // ========================================

    /**
     * Verify WebAuthn authentication from browser login page.
     * Returns auth code for Electron to exchange for tokens.
     * POST /auth/electron-login/verify
     */
    fastify.post<{
      Body: {
        sessionId: string
        credential: unknown
        deviceInfo?: { userAgent?: string }
      }
      Reply: { code: string; state: string } | { error: string }
    }>('/auth/electron-login/verify', async (request, reply) => {
      const { sessionId, credential, deviceInfo } = request.body

      // Verify session exists
      const session = electronAuthService.getSession(sessionId)
      if (!session) {
        reply.code(400)
        return { error: 'Invalid or expired session' }
      }

      try {
        // Verify WebAuthn credential using main auth service
        const result = await authService.verifyAuthentication({
          credential,
          deviceInfo,
        })

        if (!result.success || !result.user) {
          electronAuthService.markSessionError(sessionId, result.error || 'Authentication failed')
          reply.code(401)
          return { error: result.error || 'Authentication failed' }
        }

        // Generate auth code
        const authCode = electronAuthService.completeAuthentication(sessionId, result.user.id)

        return { code: authCode, state: session.state }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed'
        electronAuthService.markSessionError(sessionId, errorMessage)
        reply.code(500)
        return { error: errorMessage }
      }
    })

    // ========================================
    // Token Exchange
    // ========================================

    /**
     * Exchange auth code for tokens (PKCE verification).
     * POST /auth/electron/token
     */
    fastify.post<{
      Body: {
        code: string
        code_verifier: string
      }
      Reply: { accessToken: string; refreshToken: string } | { error: string }
    }>('/auth/electron/token', async (request, reply) => {
      const { code, code_verifier } = request.body

      if (!code || !code_verifier) {
        reply.code(400)
        return { error: 'Missing required parameters: code and code_verifier' }
      }

      try {
        const tokens = await electronAuthService.exchangeCode(code, code_verifier)
        return tokens
      } catch (error) {
        reply.code(400)
        return { error: error instanceof Error ? error.message : 'Token exchange failed' }
      }
    })

    // ========================================
    // Polling Endpoint (Fallback)
    // ========================================

    /**
     * Poll for session status.
     * Used as fallback when custom protocol (stina://) doesn't work.
     * GET /auth/electron/poll
     */
    fastify.get<{
      Querystring: { session_id: string }
      Reply:
        | { status: 'pending' | 'completed' | 'error' | 'not_found'; code?: string; state?: string; error?: string }
    }>('/auth/electron/poll', async (request) => {
      const { session_id } = request.query

      if (!session_id) {
        return { status: 'not_found' }
      }

      return electronAuthService.getSessionStatus(session_id)
    })
  }
}
