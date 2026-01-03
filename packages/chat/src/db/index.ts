import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Schema
export * from './schema.js'

// Repositories
export { ConversationRepository } from './repository.js'
export { ModelConfigRepository } from './ModelConfigRepository.js'
export type { ModelConfig, CreateModelConfigInput, UpdateModelConfigInput } from './ModelConfigRepository.js'

/**
 * Get migrations path for chat package
 * Used to register migrations with the migration system
 */
export function getChatMigrationsPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  return path.join(__dirname, 'migrations')
}
