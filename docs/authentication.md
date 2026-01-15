# Autentisering i Stina

## Översikt

Stina använder **passkey (WebAuthn)** för autentisering och **JWT** för sessionshantering. Detta ger en säker och användarvänlig inloggningsupplevelse utan lösenord.

### Driftlägen

| Läge             | Autentisering             | Användare                 |
| ---------------- | ------------------------- | ------------------------- |
| API (web/docker) | Kräver passkey-inloggning | Flertal, separerad data   |
| Electron/TUI     | Ingen inloggning          | Default-användare (admin) |
| Electron → API   | Kräver inloggning         | Som API                   |

## Arkitektur

### Paketstruktur

```
packages/auth/
├── src/
│   ├── constants.ts          # Konfigurationskonstanter
│   ├── db/
│   │   ├── schema.ts         # Drizzle databasschema
│   │   ├── migrations/       # SQL-migrationer
│   │   ├── UserRepository.ts
│   │   ├── PasskeyCredentialRepository.ts
│   │   ├── RefreshTokenRepository.ts
│   │   ├── AuthConfigRepository.ts
│   │   └── InvitationRepository.ts
│   ├── services/
│   │   ├── TokenService.ts   # JWT-hantering
│   │   ├── PasskeyService.ts # WebAuthn-operationer
│   │   ├── AuthService.ts    # Huvudorchestrator
│   │   └── DefaultUserService.ts # Lokal mode
│   ├── middleware/
│   │   └── fastify/
│   │       ├── authPlugin.ts # Fastify plugin
│   │       └── requireAuth.ts # Prehandlers
│   └── types/
│       ├── user.ts           # User, UserRole
│       └── session.ts        # TokenPair, etc.
```

### Databastabeller

#### `users`
| Kolumn        | Typ     | Beskrivning               |
|---------------|---------|---------------------------|
| id            | TEXT    | Primärnyckel              |
| username      | TEXT    | Unikt användarnamn        |
| display_name  | TEXT    | Visningsnamn (valfritt)   |
| role          | TEXT    | 'admin' eller 'user'      |
| created_at    | INTEGER | Skapades (unix timestamp) |
| updated_at    | INTEGER | Uppdaterades              |
| last_login_at | INTEGER | Senaste inloggning        |

#### `passkey_credentials`
| Kolumn        | Typ     | Beskrivning                    |
|---------------|---------|--------------------------------|
| id            | TEXT    | Primärnyckel                   |
| user_id       | TEXT    | Referens till users            |
| credential_id | TEXT    | Base64URL-encodat credential ID|
| public_key    | TEXT    | Base64URL-encodad COSE-nyckel  |
| counter       | INTEGER | Signeringsräknare              |
| transports    | TEXT    | JSON-array med transporter     |
| device_type   | TEXT    | "singleDevice"/"multiDevice"   |
| backed_up     | INTEGER | Om credential är säkerhetskopierad |
| created_at    | INTEGER | Skapades                       |
| last_used_at  | INTEGER | Senaste användning             |

#### `refresh_tokens`
| Kolumn      | Typ     | Beskrivning              |
|-------------|---------|--------------------------|
| id          | TEXT    | Primärnyckel             |
| user_id     | TEXT    | Referens till users      |
| token_hash  | TEXT    | SHA-256 hash av token    |
| expires_at  | INTEGER | Utgångstid               |
| created_at  | INTEGER | Skapades                 |
| revoked_at  | INTEGER | Återkallad (om satt)     |
| device_info | TEXT    | JSON med enhetsinformation|

#### `invitations`
| Kolumn     | Typ     | Beskrivning               |
|------------|---------|---------------------------|
| id         | TEXT    | Primärnyckel              |
| token      | TEXT    | Unik inbjudningstoken     |
| username   | TEXT    | Förtilldelat användarnamn |
| role       | TEXT    | Förtilldelad roll         |
| created_by | TEXT    | Admin som skapade         |
| expires_at | INTEGER | Utgångstid                |
| created_at | INTEGER | Skapades                  |
| used_at    | INTEGER | När den användes          |
| used_by    | TEXT    | Användaren som använde den|

#### `auth_config`
| Kolumn     | Typ     | Beskrivning           |
|------------|---------|----------------------|
| key        | TEXT    | Konfigurationsnyckel  |
| value      | TEXT    | Konfigurationsvärde   |
| created_at | INTEGER | Skapades              |

Lagrade nycklar:
- `rp_id` - Relying Party ID (domän för WebAuthn)
- `rp_origin` - Full origin (URL)
- `setup_completed` - "true" när första admin är skapad
- `access_token_secret` - JWT-secret för access tokens
- `refresh_token_secret` - JWT-secret för refresh tokens

## JWT-tokens

### Access Token
- **Giltighetstid**: 15 minuter
- **Användning**: Skickas med varje API-request i `Authorization: Bearer <token>`
- **Innehåll**:
  ```json
  {
    "sub": "user-id",
    "username": "användarnamn",
    "role": "admin|user",
    "iat": 1234567890,
    "exp": 1234567890
  }
  ```

### Refresh Token
- **Giltighetstid**: 7 dagar
- **Användning**: Skickas till `/auth/refresh` för att få ny access token
- **Lagring**: Hashas (SHA-256) innan lagring i databasen
- **Innehåll**:
  ```json
  {
    "sub": "user-id",
    "jti": "token-id",
    "iat": 1234567890,
    "exp": 1234567890
  }
  ```

## WebAuthn/Passkey-flöde

### Registrering (första användare)

```
┌─────────┐        ┌─────────┐        ┌───────────────┐
│  Client │        │   API   │        │ Auth Service  │
└────┬────┘        └────┬────┘        └───────┬───────┘
     │                  │                     │
     │ POST /auth/register/options            │
     │ { username, displayName }              │
     │────────────────>│                      │
     │                  │ generateRegistration│
     │                  │ Options()           │
     │                  │────────────────────>│
     │                  │                     │
     │                  │ Kollar om första user│
     │                  │ → blir admin        │
     │                  │<────────────────────│
     │                  │                     │
     │ { challenge, rp, user, pubKeyParams }  │
     │<────────────────│                      │
     │                  │                     │
     │ [Browser skapar │                      │
     │  credential via │                      │
     │  navigator.     │                      │
     │  credentials.   │                      │
     │  create()]      │                      │
     │                  │                     │
     │ POST /auth/register/verify             │
     │ { username, credential }               │
     │────────────────>│                      │
     │                  │ verifyRegistration()│
     │                  │────────────────────>│
     │                  │                     │
     │                  │ Skapar user,        │
     │                  │ sparar credential,  │
     │                  │ genererar tokens    │
     │                  │<────────────────────│
     │                  │                     │
     │ { user, tokens: { accessToken,         │
     │   refreshToken } }                     │
     │<────────────────│                      │
```

### Inloggning

```
┌─────────┐        ┌─────────┐        ┌───────────────┐
│  Client │        │   API   │        │ Auth Service  │
└────┬────┘        └────┬────┘        └───────┬───────┘
     │                  │                     │
     │ POST /auth/login/options               │
     │ { username? }                          │
     │────────────────>│                      │
     │                  │ generateAuthentication│
     │                  │ Options()           │
     │                  │────────────────────>│
     │                  │                     │
     │ { challenge, allowCredentials }        │
     │<────────────────│                      │
     │                  │                     │
     │ [Browser autentiserar│                 │
     │  via navigator. │                      │
     │  credentials.   │                      │
     │  get()]         │                      │
     │                  │                     │
     │ POST /auth/login/verify                │
     │ { credential }                         │
     │────────────────>│                      │
     │                  │ verifyAuthentication│
     │                  │────────────────────>│
     │                  │                     │
     │                  │ Verifierar,         │
     │                  │ uppdaterar counter, │
     │                  │ genererar tokens    │
     │                  │<────────────────────│
     │                  │                     │
     │ { user, tokens }                       │
     │<────────────────│                      │
```

## API Endpoints

| Method | Path                 | Beskrivning                 | Auth  |
|--------|---------------------|-----------------------------| ----- |
| POST   | `/auth/register/options` | Starta passkey-registrering | -     |
| POST   | `/auth/register/verify`  | Slutför registrering        | -     |
| POST   | `/auth/login/options`    | Starta passkey-inloggning   | -     |
| POST   | `/auth/login/verify`     | Slutför inloggning          | -     |
| POST   | `/auth/refresh`          | Förnya access token         | -     |
| POST   | `/auth/logout`           | Logga ut                    | ✓     |
| GET    | `/auth/me`               | Hämta inloggad användare    | ✓     |
| GET    | `/auth/users`            | Lista användare             | Admin |
| POST   | `/auth/users/invite`     | Skapa inbjudan              | Admin |
| DELETE | `/auth/users/:id`        | Ta bort användare           | Admin |
| PUT    | `/auth/users/:id/role`   | Ändra roll                  | Admin |

## Användarroller

### Admin
- Kan skapa inbjudningar för nya användare
- Kan ta bort användare
- Kan ändra användarroller
- Full åtkomst till alla funktioner

### User
- Standard roll för inbjudna användare
- Begränsad till egna data
- Kan inte administrera andra användare

## Första start (Setup)

Vid första start av API:et (när inga användare finns):

1. API redirectar till `/setup`
2. Användaren anger domän för servern (t.ex. "stina.example.com")
   - **OBS**: Domänen kan INTE ändras senare utan att alla passkeys blir ogiltiga
3. Användaren skapar admin-konto med passkey
4. Setup markeras som slutförd

## Lokal mode (Electron/TUI)

I lokal mode:
- Ingen inloggning krävs
- En default-användare med ID `local-default-user` skapas automatiskt
- Default-användaren har admin-behörighet
- All data associeras med denna användare

## Anslutning till API från Electron

Electron-appen kan ansluta till en remote API:

1. Användaren går till inställningar
2. Väljer "Anslut till server"
3. Anger server-URL
4. Loggar in med passkey
5. Tokens sparas lokalt
6. Appen byter till remote API

## Säkerhetsöverväganden

### WebAuthn
- Kräver HTTPS i produktion
- Domänen (`rpId`) måste matcha serverns domän exakt
- Endast passkeys som registrerats på rätt domän fungerar

### JWT
- Access tokens är korta (15 min) för att minimera risk vid läckage
- Refresh tokens hashas före lagring
- Revokering av refresh token loggar ut användaren

### Generella
- Alla lösenord och tokens skyddas med kryptering i viloläge
- Rate limiting bör implementeras på auth endpoints
- Alla auth-händelser bör loggas för audit trail

## Konfiguration

### Miljövariabler

```bash
# JWT secrets (genereras automatiskt vid första start om ej satta)
AUTH_ACCESS_TOKEN_SECRET=<minst 32 tecken>
AUTH_REFRESH_TOKEN_SECRET=<minst 32 tecken>

# API mode
AUTH_REQUIRED=true   # false för lokal mode (Electron/TUI)

# Valfritt: Sätt domän via env istället för UI
# AUTH_RP_ID=stina.example.com
# AUTH_RP_ORIGIN=https://stina.example.com
```

## Användning i kod

### Registrera auth plugin

```typescript
import { authPlugin, AuthService } from '@stina/auth'

// I server.ts
await fastify.register(authPlugin, {
  authService,
  requireAuth: true,
  defaultUserId: undefined,
})
```

### Skydda routes

```typescript
import { requireAuth, requireAdmin } from '@stina/auth'

// Kräver inloggning
fastify.get('/protected', { preHandler: requireAuth }, async (request) => {
  return { user: request.user }
})

// Kräver admin
fastify.post('/admin-only', { preHandler: requireAdmin }, async (request) => {
  // ...
})
```

### Lokal mode i Electron

```typescript
import { DefaultUserService, UserRepository } from '@stina/auth'

const userRepo = new UserRepository(db)
const defaultUserService = new DefaultUserService(userRepo)

// Säkerställ att default-användare finns
const defaultUser = await defaultUserService.ensureDefaultUser()

// Använd defaultUser.id för alla repositories
const conversationRepo = new ConversationRepository(db, defaultUser.id)
```
