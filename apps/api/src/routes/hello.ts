import type { FastifyPluginAsync } from 'fastify'
import { getGreeting } from '@stina/core'
import type { Greeting } from '@stina/shared'

export const helloRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{
    Querystring: { name?: string }
    Reply: Greeting
  }>('/hello', async (request) => {
    const name = request.query.name
    return getGreeting(name)
  })
}
