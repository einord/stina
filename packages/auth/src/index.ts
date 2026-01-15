// Constants
export { AUTH_CONFIG, AUTH_CONFIG_KEYS } from './constants.js'

// Types
export type {
  User,
  UserRole,
  CreateUserInput,
  UpdateUserInput,
} from './types/user.js'
export type {
  AccessTokenPayload,
  RefreshTokenPayload,
  TokenPair,
  RefreshTokenData,
  DeviceInfo,
} from './types/session.js'

// Re-export from submodules for convenience
export { getAuthMigrationsPath } from './db/index.js'
export type { AuthDb } from './db/index.js'

export {
  TokenService,
  PasskeyService,
  AuthService,
  DefaultUserService,
  base64UrlToUint8Array,
  uint8ArrayToBase64Url,
} from './services/index.js'
export type {
  TokenConfig,
  GeneratedRefreshToken,
  PasskeyConfig,
  PasskeyUser,
  ExistingCredential,
  StoredCredential,
  RegistrationOptionsInput,
  RegistrationVerifyInput,
  AuthenticationOptionsInput,
  AuthenticationVerifyInput,
  AuthResult,
  CreateInvitationInput,
} from './services/index.js'

export {
  authPlugin,
  requireAuth,
  requireAdmin,
  requireRole,
} from './middleware/index.js'
export type { AuthPluginOptions } from './middleware/index.js'
