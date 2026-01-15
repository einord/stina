import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Schema exports
export {
  users,
  passkeyCredentials,
  refreshTokens,
  authConfig,
  invitations,
  authSchema,
} from './schema.js'
export type { AuthDb, UserRole } from './schema.js'

// Repository exports
export { UserRepository } from './UserRepository.js'
export { PasskeyCredentialRepository } from './PasskeyCredentialRepository.js'
export type { PasskeyCredential, CreatePasskeyCredentialInput } from './PasskeyCredentialRepository.js'
export { RefreshTokenRepository } from './RefreshTokenRepository.js'
export type { CreateRefreshTokenInput } from './RefreshTokenRepository.js'
export { AuthConfigRepository } from './AuthConfigRepository.js'
export { InvitationRepository } from './InvitationRepository.js'
export type { Invitation, CreateInvitationInput } from './InvitationRepository.js'

/**
 * Get the path to auth migrations directory
 */
export function getAuthMigrationsPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  return join(currentDir, 'migrations')
}
