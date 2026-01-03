import type { FastifyPluginAsync } from 'fastify'
import { themeRegistry, AppError, ErrorCode } from '@stina/core'
import type { ThemeSummary, ApiError } from '@stina/shared'
import type { ThemeTokens } from '@stina/core'

export const themeRoutes: FastifyPluginAsync = async (fastify) => {
  // List all themes
  fastify.get<{ Reply: ThemeSummary[] }>('/themes', async () => {
    const themes = themeRegistry.listThemes()
    return themes.map((t) => ({ id: t.id, label: t.label }))
  })

  // Get theme by ID
  fastify.get<{
    Params: { id: string }
    Reply: ThemeTokens | ApiError
  }>('/themes/:id', async (request, reply) => {
    const theme = themeRegistry.getTheme(request.params.id)

    if (!theme) {
      const error = new AppError(ErrorCode.THEME_NOT_FOUND, `Theme not found: ${request.params.id}`)
      reply.status(404)
      return { error: { code: error.code, message: error.message } }
    }

    return theme.tokens
  })
}
