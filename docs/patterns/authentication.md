# Authentication Patterns

This document covers the authentication patterns used in Stina, including WebAuthn passkey authentication, JWT token management, and the differences between Web and Electron authentication flows.

## Overview

Stina uses **WebAuthn (passkey) authentication** combined with **JWT tokens**. This provides:

- Passwordless authentication using biometrics, security keys, or platform authenticators
- Short-lived access tokens (15 minutes) for API requests
- Long-lived refresh tokens (7 days) for session persistence
- Role-based access control (admin/user)

## Web Authentication Flow

The web application uses direct WebAuthn authentication in the browser.

```
┌─────────────────┐                           ┌─────────────────┐
│     Browser     │                           │       API       │
└────────┬────────┘                           └────────┬────────┘
         │                                             │
         │  1. POST /auth/login/options               │
         │     { username }                            │
         │────────────────────────────────────────────>│
         │                                             │
         │<────────────────────────────────────────────│
         │     { challenge, allowCredentials }         │
         │                                             │
         │  2. navigator.credentials.get()             │
         │     (User authenticates with passkey)       │
         │                                             │
         │  3. POST /auth/login/verify                 │
         │     { credential, deviceInfo }              │
         │────────────────────────────────────────────>│
         │                                             │
         │<────────────────────────────────────────────│
         │     { accessToken, refreshToken, user }     │
         │                                             │
         │  4. Store tokens in localStorage            │
         │                                             │
         │  5. Include in requests:                    │
         │     Authorization: Bearer <accessToken>     │
         │────────────────────────────────────────────>│
```

## Middleware Usage

### requireAuth

Ensures the user is authenticated. Returns 401 if not.

```typescript
import { requireAuth } from '@stina/auth'

fastify.get('/conversations', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id  // Always available after requireAuth
  const conversations = await conversationService.list(userId)
  return conversations
})
```

### requireAdmin

Ensures the user has admin role. Returns 401 if not authenticated, 403 if not admin.

```typescript
import { requireAdmin } from '@stina/auth'

fastify.delete('/users/:id', { preHandler: requireAdmin }, async (request) => {
  const { id } = request.params as { id: string }
  await userService.delete(id)
  return { success: true }
})
```

### requireRole

Factory function for checking specific roles.

```typescript
import { requireRole } from '@stina/auth'

fastify.put('/settings/global', {
  preHandler: requireRole('admin')
}, async (request) => {
  // Only admins can modify global settings
})
```

## Auth Plugin Setup

The `authPlugin` must be registered with Fastify to enable authentication.

```typescript
// apps/api/src/server.ts
import { authPlugin } from '@stina/auth'

await fastify.register(authPlugin, {
  authService,
  requireAuth: true,  // Enable JWT verification
})
```

The plugin adds an `onRequest` hook that:

1. Extracts JWT from `Authorization: Bearer <token>` header
2. Falls back to `?token=` query param (for SSE connections)
3. Verifies the token and fetches the user
4. Sets `request.user` and `request.isAuthenticated`

## Accessing userId in Routes

After `requireAuth`, the user is always available on the request:

```typescript
fastify.get('/my-data', { preHandler: requireAuth }, async (request) => {
  const userId = request.user!.id

  // Use userId to scope data access
  const repository = new ConversationRepository(db, userId)
  return repository.listActiveConversations()
})
```

For SSE endpoints that need authentication via query param:

```typescript
fastify.get('/chat/events', async (request, reply) => {
  // authPlugin already extracted token from ?token= param
  if (!request.user) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  const userId = request.user.id
  // Set up SSE stream for this user...
})
```

## Electron Authentication (PKCE Flow)

Electron cannot use WebAuthn directly due to security restrictions. Instead, it uses PKCE (Proof Key for Code Exchange) with an external browser.

```
┌─────────────┐                 ┌─────────────┐                 ┌─────────────┐
│  Electron   │                 │   Browser   │                 │    API      │
└──────┬──────┘                 └──────┬──────┘                 └──────┬──────┘
       │                               │                               │
       │ 1. Generate code_verifier     │                               │
       │    + code_challenge           │                               │
       │                               │                               │
       │ 2. POST /auth/electron/session                                │
       │    { codeChallenge, state }   │                               │
       │───────────────────────────────┼──────────────────────────────>│
       │<──────────────────────────────┼─────── { sessionId } ─────────│
       │                               │                               │
       │ 3. Open system browser ──────>│                               │
       │    /login?session=xxx         │                               │
       │                               │                               │
       │                               │ 4. User completes WebAuthn ──>│
       │                               │    POST /auth/electron-login/verify
       │                               │                               │
       │                               │<── Redirect to ───────────────│
       │                               │    stina://callback?code=xxx  │
       │                               │                               │
       │<── 5. Custom protocol ────────│                               │
       │    stina://auth-callback      │                               │
       │                               │                               │
       │ 6. POST /auth/electron/token ─┼──────────────────────────────>│
       │    { code, codeVerifier }     │                               │
       │<──────────────────────────────┼── { accessToken, refreshToken }
       │                               │                               │
       │ 7. Store in safeStorage       │                               │
       │    (OS keychain encrypted)    │                               │
```

## Key Files for Electron Auth

| File | Purpose |
|------|---------|
| `apps/api/src/routes/electronAuth.ts` | PKCE session and token exchange endpoints |
| `apps/electron/src/main/authProtocol.ts` | Custom `stina://` protocol handler |
| `packages/auth/src/services/ElectronAuthService.ts` | PKCE session management |

## Electron Local Mode

For development or single-user scenarios, Electron can skip authentication entirely:

```typescript
// apps/electron/src/main/index.ts
const defaultUserId = 'local-default-user'

await fastify.register(authPlugin, {
  authService,
  requireAuth: false,  // Disable JWT verification
  defaultUserId,       // All requests use this user
})
```

In local mode:
- No login UI is shown
- All requests are automatically associated with the default user
- Middleware like `requireAuth` still passes (using default user)
- Data is stored locally without multi-user separation

## Web vs Electron Comparison

| Aspect | Web | Electron |
|--------|-----|----------|
| Auth Method | Direct WebAuthn in browser | PKCE via external browser |
| Token Storage | localStorage | Electron safeStorage (OS keychain) |
| First User Setup | Passkey prompt in app | Opens system browser |
| Session Persistence | Browser localStorage | Encrypted file via safeStorage |
| Local Mode | Not applicable | Default user, no auth required |
| Token Refresh | Automatic via HTTP interceptor | Automatic via IPC |
| Security | Browser sandbox | Main process + renderer isolation |

## Token Storage Patterns

### Web (localStorage)

```typescript
// After successful login
localStorage.setItem('accessToken', tokens.accessToken)
localStorage.setItem('refreshToken', tokens.refreshToken)

// For API requests
const accessToken = localStorage.getItem('accessToken')
fetch('/api/data', {
  headers: { Authorization: `Bearer ${accessToken}` }
})
```

### Electron (safeStorage)

Electron uses the OS keychain for secure storage:

```typescript
// In main process
import { safeStorage } from 'electron'

// Encrypt and store
const encrypted = safeStorage.encryptString(tokens.accessToken)
fs.writeFileSync(tokenPath, encrypted)

// Decrypt and use
const encrypted = fs.readFileSync(tokenPath)
const accessToken = safeStorage.decryptString(encrypted)
```

This provides platform-specific encryption:
- **macOS**: Keychain encryption
- **Windows**: DPAPI encryption
- **Linux**: Secret Service API or libsecret

## First User Registration

The first user to register automatically becomes an admin:

```typescript
// Check if this is the first user
const { isFirstUser } = await authService.generateRegistrationOptions({
  username: 'alice'
})

if (isFirstUser) {
  // No invitation required, will be assigned admin role
}
```

Subsequent users require an invitation:

```typescript
// Admin creates invitation
const invitation = await authService.createInvitation(adminUserId, {
  username: 'bob',
  role: 'user'
})

// New user registers with invitation token
await authService.generateRegistrationOptions({
  username: 'bob',
  invitationToken: invitation.token
})
```

## See Also

- [@stina/auth Package Reference](../packages/auth.md) - Detailed API documentation
- [Adding API Endpoints](../guides/adding-api-endpoint.md) - How to create protected routes
