# @stina/auth

Authentication and authorization package for Stina. Provides WebAuthn (passkey) registration and login, JWT token management, and role-based access control (RBAC).

## Package Overview

The auth package handles all authentication concerns for Stina:

- **WebAuthn/Passkey Authentication** - Passwordless authentication using biometrics, security keys, or platform authenticators (Touch ID, Face ID, Windows Hello)
- **JWT Token Management** - Short-lived access tokens and long-lived refresh tokens
- **Role-Based Access Control** - Admin and user roles with middleware enforcement
- **Multi-Platform Support** - Different auth flows for Web (direct) and Electron (PKCE via external browser)

## Key Exports

```typescript
// Services
export { AuthService } from './services/AuthService.js'
export { TokenService } from './services/TokenService.js'
export { PasskeyService } from './services/PasskeyService.js'
export { DefaultUserService } from './services/DefaultUserService.js'
export { ElectronAuthService } from './services/ElectronAuthService.js'

// Middleware
export { authPlugin, requireAuth, requireAdmin, requireRole } from './middleware/index.js'

// Types
export type { User, UserRole, CreateUserInput, UpdateUserInput } from './types/user.js'
export type { TokenPair, AccessTokenPayload, RefreshTokenPayload } from './types/session.js'
export type { AuthPluginOptions } from './middleware/index.js'
```

## Core Types

### User

```typescript
type UserRole = 'admin' | 'user'

interface User {
  id: string
  username: string
  displayName: string | null
  role: UserRole
  createdAt: Date
  updatedAt: Date
  lastLoginAt: Date | null
}
```

### Token Types

```typescript
interface TokenPair {
  accessToken: string   // Short-lived JWT (15 minutes)
  refreshToken: string  // Long-lived JWT (7 days)
}

interface AccessTokenPayload {
  sub: string       // User ID
  username: string
  role: UserRole
  iat: number       // Issued at timestamp
  exp: number       // Expiration timestamp
}

interface RefreshTokenPayload {
  sub: string       // User ID
  jti: string       // Token ID (for revocation)
  iat: number
  exp: number
}
```

## Services

### AuthService

The main authentication orchestrator that coordinates all auth operations.

```typescript
const authService = new AuthService(
  userRepository,
  passkeyCredentialRepository,
  refreshTokenRepository,
  authConfigRepository,
  invitationRepository,
  tokenService,
  passkeyService
)

// Registration flow
const { options, isFirstUser } = await authService.generateRegistrationOptions({
  username: 'alice',
  displayName: 'Alice',
  invitationToken: '...'  // Required for non-first users
})

const result = await authService.verifyRegistration({
  username: 'alice',
  credential: webAuthnResponse,
  invitationToken: '...'
})

// Authentication flow
const options = await authService.generateAuthenticationOptions({ username: 'alice' })
const result = await authService.verifyAuthentication({
  credential: webAuthnResponse,
  deviceInfo: { userAgent: '...', ip: '...' }
})

// Token management
const payload = await authService.verifyAccessToken(accessToken)
const result = await authService.refreshAccessToken(refreshToken)
await authService.revokeRefreshToken(refreshToken)
```

### TokenService

Handles JWT generation and verification.

```typescript
const tokenService = new TokenService({
  accessTokenSecret: 'secret1',
  refreshTokenSecret: 'secret2',
  accessTokenExpiry: '15m',   // Optional, defaults to 15m
  refreshTokenExpiry: '7d',   // Optional, defaults to 7d
})

const accessToken = await tokenService.generateAccessToken(user)
const { tokens, refreshTokenData } = await tokenService.generateTokenPair(user)
const payload = await tokenService.verifyAccessToken(token)
```

### PasskeyService

Wraps the `@simplewebauthn/server` library for WebAuthn operations.

```typescript
const passkeyService = new PasskeyService({
  rpId: 'example.com',
  origin: 'https://example.com',
  rpName: 'Stina'  // Optional
})

const options = await passkeyService.generateRegistrationOptions(user, existingCredentials)
const result = await passkeyService.verifyRegistration(challenge, response)
```

### DefaultUserService

Manages the default local user for Electron and TUI modes where no authentication is required.

```typescript
const defaultUserService = new DefaultUserService(userRepository)

// Creates user if not exists, returns existing otherwise
const user = await defaultUserService.ensureDefaultUser()

const userId = defaultUserService.getDefaultUserId()  // 'local-default-user'
const isDefault = defaultUserService.isDefaultUser(userId)
```

### ElectronAuthService

Manages PKCE sessions for Electron's external browser authentication flow.

```typescript
const electronAuthService = new ElectronAuthService(
  tokenService,
  userRepository,
  refreshTokenRepository,
  { sessionTtlMs: 5 * 60 * 1000, authCodeTtlMs: 60 * 1000 }
)

const sessionId = electronAuthService.createSession(codeChallenge, state)
const authCode = electronAuthService.completeAuthentication(sessionId, userId)
const tokens = await electronAuthService.exchangeCode(authCode, codeVerifier)
```

## Middleware

### authPlugin

Fastify plugin that extracts and verifies JWT from requests.

```typescript
import { authPlugin } from '@stina/auth'

fastify.register(authPlugin, {
  authService,
  requireAuth: true,           // false for local mode
  defaultUserId: 'local-user'  // Used when requireAuth is false
})

// After registration, request.user is available
fastify.get('/profile', async (request) => {
  return request.user  // User | null
})
```

### requireAuth

Prehandler that returns 401 if user is not authenticated.

```typescript
fastify.get('/protected', {
  preHandler: requireAuth
}, async (request) => {
  // request.user is guaranteed to exist
})
```

### requireAdmin

Prehandler that returns 401 if not authenticated, 403 if not admin.

```typescript
fastify.delete('/users/:id', {
  preHandler: requireAdmin
}, async (request) => {
  // Only admins can reach here
})
```

### requireRole

Factory function to create role-checking prehandler.

```typescript
fastify.post('/settings', {
  preHandler: requireRole('admin')
}, async (request) => {
  // Admin role required
})
```

## Web vs Electron Authentication

| Aspect | Web | Electron |
|--------|-----|----------|
| Auth Flow | Direct WebAuthn in browser | PKCE via external browser |
| Token Storage | localStorage | Electron safeStorage (encrypted) |
| First User Setup | Browser prompts for passkey | Opens system browser for setup |
| Session Management | Standard JWT refresh | Same, but tokens stored securely |
| Local Mode | Not applicable | Default user, no auth required |

## PKCE Flow for Electron

Electron cannot directly use WebAuthn due to security restrictions. Instead, it uses PKCE (Proof Key for Code Exchange) with an external browser:

```
┌─────────────┐                 ┌─────────────┐                 ┌─────────────┐
│  Electron   │                 │   Browser   │                 │    API      │
└──────┬──────┘                 └──────┬──────┘                 └──────┬──────┘
       │                               │                               │
       │ 1. Generate code_verifier     │                               │
       │    + code_challenge           │                               │
       │                               │                               │
       │ 2. POST /electron/session ────┼──────────────────────────────>│
       │    (code_challenge, state)    │                               │
       │<──────────────────────────────┼─────── session_id ────────────│
       │                               │                               │
       │ 3. Open browser ─────────────>│                               │
       │    /login?session=xxx         │                               │
       │                               │                               │
       │                               │ 4. User completes WebAuthn ──>│
       │                               │                               │
       │                               │<───── Redirect to ────────────│
       │                               │    stina://callback?code=xxx  │
       │                               │                               │
       │<───── 5. Custom protocol ─────│                               │
       │       stina://callback        │                               │
       │                               │                               │
       │ 6. POST /electron/token ──────┼──────────────────────────────>│
       │    (code, code_verifier)      │                               │
       │<──────────────────────────────┼─────── JWT tokens ────────────│
       │                               │                               │
       │ 7. Store in safeStorage       │                               │
```

**Key files:**

- `apps/api/src/routes/electronAuth.ts` - PKCE endpoints
- `apps/electron/src/main/authProtocol.ts` - Custom protocol handler
- `packages/auth/src/services/ElectronAuthService.ts` - Session management

## Token Storage

### Web (localStorage)

```typescript
// In browser
localStorage.setItem('accessToken', tokens.accessToken)
localStorage.setItem('refreshToken', tokens.refreshToken)
```

### Electron (safeStorage)

Electron uses the OS keychain for secure token storage:

```typescript
// In main process
import { safeStorage } from 'electron'

const encrypted = safeStorage.encryptString(tokens.accessToken)
// Store encrypted buffer in file or settings

const decrypted = safeStorage.decryptString(encrypted)
```

This provides:
- **macOS**: Keychain encryption
- **Windows**: DPAPI encryption
- **Linux**: Secret Service API or libsecret

## Configuration Constants

```typescript
export const AUTH_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  TOKEN_ISSUER: 'stina',
  DEFAULT_USER_ID: 'local-default-user',
  DEFAULT_USERNAME: 'local',
  RP_NAME: 'Stina',
}
```

## First User Registration

The first user to register automatically becomes an admin. Subsequent users require an invitation from an existing admin:

```typescript
// Check if first user
const isFirst = await authService.isFirstUser()

// Create invitation (admin only)
const invitation = await authService.createInvitation(adminUserId, {
  username: 'newuser',
  role: 'user'
})

// Register with invitation
await authService.generateRegistrationOptions({
  username: 'newuser',
  invitationToken: invitation.token
})
```
