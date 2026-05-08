import type { FastifyPluginAsync } from 'fastify'
import type { UserRepository } from '@stina/auth/db'
import type { TokenService } from '@stina/auth'
import type { RefreshTokenRepository } from '@stina/auth/db'

/**
 * Factory for the E2E-only session endpoint.
 * Gated by `STINA_E2E=true` — returns 403 in production.
 */
export function createE2ESessionRoutes(deps: {
  userRepository: UserRepository
  tokenService: TokenService
  refreshTokenRepository: RefreshTokenRepository
}): FastifyPluginAsync {
  return async (fastify) => {
    fastify.post('/auth/e2e-session', async (_request, reply) => {
      if (process.env['STINA_E2E'] !== 'true') {
        reply.code(403)
        return { error: 'Not available outside of E2E test mode' }
      }
      const user = await deps.userRepository.getByUsername('e2e-test')
      if (!user) {
        reply.code(500)
        return { error: 'E2E user not found — did global-setup run?' }
      }
      const { tokens, refreshTokenData } = await deps.tokenService.generateTokenPair(user)
      await deps.refreshTokenRepository.create({
        userId: user.id,
        tokenHash: refreshTokenData.tokenHash,
        expiresAt: refreshTokenData.expiresAt,
      })
      await deps.userRepository.updateLastLogin(user.id)
      return { user, tokens }
    })
  }
}
