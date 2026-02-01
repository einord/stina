# Extension System Plan

## Översikt

Stina ska ha ett extension-system inspirerat av VS Code, men med striktare sandbox för säkerhet. Extensions ska fungera på alla plattformar (Web, Electron, TUI) och både utvecklare och användare ska ha bra upplevelse.

## Arkitektur: Worker-baserad Sandbox

Extensions körs i isolerade Web Workers (browser) eller Worker Threads (Node.js). All kommunikation sker via message passing, och hosten kontrollerar exakt vilka API:er varje extension får tillgång till.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Stina Application                           │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Extension Host                            │ │
│  │  - Laddar manifests och validerar permissions               │ │
│  │  - Startar/stoppar workers                                  │ │
│  │  - Routar meddelanden mellan app och extensions             │ │
│  │  - Enforcar permissions (blockar otillåtna anrop)           │ │
│  └────────────────────────────────────────────────────────────┘ │
│           │                │                │                    │
│           ▼                ▼                ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Worker    │  │   Worker    │  │   Worker    │             │
│  │ ollama-ai   │  │ weather-tool│  │ file-search │             │
│  │             │  │             │  │             │             │
│  │ Sandboxed:  │  │ Sandboxed:  │  │ Sandboxed:  │             │
│  │ - network   │  │ - network   │  │ - files     │             │
│  │ - settings  │  │ - tools     │  │ - tools     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### Varför Workers?

| Alternativ | Fördelar | Nackdelar |
|------------|----------|-----------|
| **Workers (valt)** | Äkta isolation, cross-platform, JS-ekosystem | Async-only, viss overhead |
| In-process JS | Snabbt, enkelt | Kan inte sandboxas säkert |
| WebAssembly | Stark sandbox | Komplex DX, begränsat ekosystem |
| Docker/containers | Maximum isolation | För tungt för desktop-app |

---

## Package Structure

```
stina/
├── packages/
│   ├── extension-api/          # API som extensions importerar (types + runtime)
│   │   ├── src/
│   │   │   ├── index.ts        # Public API
│   │   │   ├── types.ts        # ExtensionContext, permissions, etc.
│   │   │   └── runtime.ts      # Worker-side message handling
│   │   └── package.json
│   │
│   ├── extension-host/         # Host-side som kör i main thread
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── ExtensionHost.ts        # Huvudklass
│   │   │   ├── ExtensionWorker.ts      # Worker lifecycle
│   │   │   ├── PermissionChecker.ts    # Validerar permissions
│   │   │   ├── ManifestValidator.ts    # Validerar manifest.json
│   │   │   └── registry/
│   │   │       ├── ProviderRegistry.ts
│   │   │       ├── ToolRegistry.ts
│   │   │       └── SettingsRegistry.ts
│   │   └── package.json
│   │
│   └── extension-installer/    # Hanterar installation från GitHub/registry
│       ├── src/
│       │   ├── index.ts
│       │   ├── GitHubInstaller.ts
│       │   ├── LocalInstaller.ts
│       │   └── ExtensionStorage.ts     # Var extensions sparas
│       └── package.json
│
├── extensions/                  # Inbyggda/first-party extensions
│   └── ollama-provider/
│       ├── src/
│       │   └── index.ts
│       ├── manifest.json
│       └── package.json
│
└── docs/
    └── extension-development.md
```

---

## Extension Manifest (manifest.json)

```json
{
  "$schema": "https://stina.app/schemas/extension-manifest.json",
  "id": "ollama-provider",
  "name": "Ollama AI Provider",
  "version": "1.0.0",
  "description": "Connect Stina to your local Ollama instance",
  "author": {
    "name": "Stina Team",
    "url": "https://github.com/stina-app"
  },
  "repository": "https://github.com/stina-app/ollama-provider",
  "license": "MIT",
  "engines": {
    "stina": ">=0.5.0"
  },
  "platforms": ["web", "electron", "tui"],
  "main": "dist/index.js",

  "permissions": [
    "network:localhost:11434",
    "settings.register",
    "provider.register"
  ],

  "contributes": {
    "settings": [
      {
        "id": "url",
        "type": "string",
        "default": "http://localhost:11434",
        "title": "Ollama URL",
        "description": "URL to your Ollama server"
      },
      {
        "id": "defaultModel",
        "type": "string",
        "default": "llama3.2",
        "title": "Default Model",
        "description": "Model to use when none is specified"
      }
    ],

    "providers": [
      {
        "id": "ollama",
        "name": "Ollama",
        "description": "Local AI models via Ollama"
      }
    ]
  }
}
```

---

## Permission System

### Permission Categories

| Kategori | Permission | Beskrivning |
|----------|------------|-------------|
| **Network** | `network:*` | All network access |
| | `network:localhost` | Only localhost (any port) |
| | `network:localhost:11434` | Specific host:port |
| | `network:api.example.com` | Specific domain |
| **Storage** | `database.own` | Egna tabeller (prefixade) |
| | `storage.local` | Key-value storage |
| **User Data** | `user.profile.read` | Namn, avatar |
| | `user.location.read` | Plats |
| | `chat.history.read` | Läsa konversationshistorik |
| | `chat.current.read` | Läsa pågående konversation |
| **Capabilities** | `provider.register` | Registrera AI-providers |
| | `tools.register` | Registrera verktyg för Stina |
| | `settings.register` | Registrera inställningar |
| | `commands.register` | Registrera slash-commands |
| **System** | `files.read` | Läsa filer (med godkännande) |
| | `files.write` | Skriva filer (med godkännande) |
| | `clipboard.read` | Läsa urklipp |
| | `clipboard.write` | Skriva till urklipp |

### Permission Prompts

Vid installation visas användaren en sammanfattning:

```
┌─────────────────────────────────────────────────────┐
│  Install "Ollama AI Provider"?                      │
│                                                     │
│  This extension will be able to:                    │
│                                                     │
│  🌐 Connect to localhost:11434                      │
│  ⚙️  Add settings you can configure                 │
│  🤖 Provide AI models for Stina to use             │
│                                                     │
│  [Cancel]                      [Install Extension]  │
└─────────────────────────────────────────────────────┘
```

### Runtime Enforcement

Extension Host validerar VARJE anrop:

```typescript
// I ExtensionHost
handleMessage(extensionId: string, message: ExtensionMessage) {
  const permissions = this.getPermissions(extensionId)

  if (message.type === 'network.fetch') {
    const url = new URL(message.payload.url)
    if (!this.isNetworkAllowed(permissions, url)) {
      return { error: 'PERMISSION_DENIED', message: `Network access to ${url.host} not allowed` }
    }
  }

  // ... handle message
}
```

---

## Extension API

### ExtensionContext

Varje extension får ett `ExtensionContext`-objekt med bara de API:er dess permissions tillåter:

```typescript
// packages/extension-api/src/types.ts

export interface ExtensionContext {
  /** Extension metadata */
  extension: {
    id: string
    version: string
    storagePath: string
  }

  /** Network access (if permitted) */
  network?: {
    fetch(url: string, options?: RequestInit): Promise<Response>
  }

  /** Settings access (if permitted) */
  settings?: {
    get<T>(key: string): Promise<T>
    set(key: string, value: unknown): Promise<void>
    onChange(callback: (key: string, value: unknown) => void): Disposable
  }

  /** Provider registration (if permitted) */
  providers?: {
    register(provider: AIProvider): Disposable
  }

  /** Tool registration (if permitted) */
  tools?: {
    register(tool: Tool): Disposable
  }

  /** Database access (if permitted) */
  database?: {
    execute(sql: string, params?: unknown[]): Promise<unknown[]>
    // Note: SQL is validated to only allow access to extension's prefixed tables
  }

  /** Logging (always available) */
  log: {
    info(message: string, data?: object): void
    warn(message: string, data?: object): void
    error(message: string, data?: object): void
  }
}
```

### AIProvider Interface

```typescript
export interface AIProvider {
  id: string
  name: string

  /** Get available models */
  getModels(): Promise<ModelInfo[]>

  /** Chat completion with streaming */
  chat(
    messages: ChatMessage[],
    options: ChatOptions
  ): AsyncGenerator<StreamEvent, void, unknown>

  /** Optional: embeddings */
  embed?(texts: string[]): Promise<number[][]>
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
  contextLength?: number
}

export interface ChatOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
}
```

---

## Ollama Provider Implementation

```typescript
// extensions/ollama-provider/src/index.ts
import type { ExtensionContext, AIProvider, StreamEvent } from '@stina/extension-api'

export function activate(context: ExtensionContext) {
  const provider: AIProvider = {
    id: 'ollama',
    name: 'Ollama',

    async getModels() {
      const settings = await context.settings!.get<{ url: string }>('ollama')
      const url = settings?.url || 'http://localhost:11434'

      const response = await context.network!.fetch(`${url}/api/tags`)
      const data = await response.json()

      return data.models.map((m: { name: string; details?: { parameter_size?: string } }) => ({
        id: m.name,
        name: m.name,
        description: m.details?.parameter_size
      }))
    },

    async *chat(messages, options) {
      const settings = await context.settings!.get<{ url: string; defaultModel: string }>('ollama')
      const url = settings?.url || 'http://localhost:11434'
      const model = options.model || settings?.defaultModel || 'llama3.2'

      const response = await context.network!.fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          stream: true
        }),
        signal: options.signal
      })

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          const data = JSON.parse(line)
          if (data.message?.content) {
            yield { type: 'content', text: data.message.content } as StreamEvent
          }
          if (data.done) {
            yield { type: 'done' } as StreamEvent
          }
        }
      }
    }
  }

  // Register the provider
  const disposable = context.providers!.register(provider)

  context.log.info('Ollama provider activated')

  return disposable
}

export function deactivate() {
  // Cleanup if needed
}
```

---

## Database Isolation

Extensions får bara tillgång till tabeller med sitt eget prefix:

```typescript
// I ExtensionHost
validateSQL(extensionId: string, sql: string): boolean {
  const prefix = `ext_${extensionId.replace(/-/g, '_')}_`

  // Parse SQL och verifiera att alla tabellreferenser har rätt prefix
  const tables = extractTableNames(sql)
  return tables.every(table => table.startsWith(prefix))
}
```

Extension kan skapa egna tabeller:

```typescript
// I en extension
await context.database!.execute(`
  CREATE TABLE IF NOT EXISTS ext_my_extension_cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    expires_at INTEGER
  )
`)
```

---

## Installation Flow

### Från GitHub

```
1. User: "Install from github.com/user/stina-weather-tool"

2. ExtensionInstaller:
   - Fetch manifest.json from repo
   - Validate manifest schema
   - Show permission prompt to user

3. User approves

4. ExtensionInstaller:
   - Download release bundle (dist/)
   - Verify checksum/signature (if available)
   - Extract to ~/.stina/extensions/weather-tool/
   - Update installed-extensions.json

5. ExtensionHost:
   - Load new extension
   - Start worker
   - Call activate()
```

### Lokal utveckling

```bash
# Under utveckling - symlinka till extensions-mappen
cd ~/.stina/extensions
ln -s /path/to/my-extension my-extension

# Eller använd CLI
stina ext link /path/to/my-extension

# Hot reload under utveckling
stina ext dev /path/to/my-extension
```

---

## UI Components

### Extension Browser View

```
┌─────────────────────────────────────────────────────────────────┐
│  🧩 Extensions                                    [Search...] 🔍│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  INSTALLED                                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🟢 Ollama AI Provider                           ⚙️  🗑️    │ │
│  │    Local AI models via Ollama                   v1.0.0    │ │
│  │    🌐 localhost:11434  ⚙️ settings  🤖 provider           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  AVAILABLE                                                      │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ☁️  Weather Tool                               [Install]   │ │
│  │    Get weather information for any location                │ │
│  │    ⭐ 4.8  📥 1.2k downloads                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📁 File Search                                 [Install]   │ │
│  │    Let Stina search and read files on your computer        │ │
│  │    ⭐ 4.5  📥 890 downloads                                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Extension Detail View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🤖 Ollama AI Provider                                         │
│  by Stina Team • v1.0.0 • MIT License                          │
│                                                                 │
│  Connect Stina to your local Ollama instance for                │
│  private, offline AI conversations.                             │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  PERMISSIONS                                                    │
│  🌐 Network: localhost:11434                                    │
│  ⚙️  Can register settings                                      │
│  🤖 Can provide AI models                                       │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  SETTINGS                                                       │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Ollama URL                                                 │ │
│  │ [http://localhost:11434                              ]     │ │
│  │                                                            │ │
│  │ Default Model                                              │ │
│  │ [llama3.2                          ] [▼]                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [Disable]  [Uninstall]                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Fas 1: Foundation (MVP)
- [ ] `packages/extension-api` - Types + worker runtime
- [ ] `packages/extension-host` - Basic host, permission checker
- [ ] Worker spawning (Web Worker + Node Worker Thread)
- [ ] Message passing protocol
- [ ] Basic permission system

### Fas 2: First Extension
- [ ] `extensions/ollama-provider` - Ollama AI provider
- [ ] Provider registration
- [ ] Settings registration + UI
- [ ] Integration med ChatOrchestrator

### Fas 3: Installation
- [ ] `packages/extension-installer` - GitHub installer
- [ ] Local extension loading
- [ ] Extension storage structure
- [ ] CLI commands (`stina ext install/remove/list`)

### Fas 4: UI
- [ ] Extension Browser view
- [ ] Extension Detail view
- [ ] Permission prompts
- [ ] Settings UI

### Fas 5: Advanced Features
- [ ] Database isolation
- [ ] Tool registration
- [ ] Command registration
- [ ] Extension marketplace (future)

---

## Security Checklist

- [ ] Workers have no access to main thread globals
- [ ] Network requests validated against permission whitelist
- [ ] SQL validated to only access prefixed tables
- [ ] File paths validated and sandboxed
- [ ] Extension code signature verification (future)
- [ ] Audit logging of sensitive operations
- [ ] Rate limiting on API calls
- [ ] Memory limits per worker

---

## Beslutade Designval

| Fråga | Beslut | Motivering |
|-------|--------|------------|
| **Registry** | Egen registry (JSON på GitHub) | Full kontroll, enkel start |
| **Publicering** | Via PR till registry-repo | Balans mellan öppenhet och kontroll |
| **First-party sandbox** | Samma som community | Konsekvent säkerhetsmodell |
| **Ollama extension** | Separat repo | Visar community-mönstret |

---

## Registry Design

### Struktur: stina-extensions-registry repo

```
stina-extensions-registry/
├── registry.json           # Huvudfil med alla extensions
├── extensions/
│   ├── ollama-provider.json    # Detaljerad info per extension
│   ├── weather-tool.json
│   └── ...
├── schemas/
│   └── extension-entry.schema.json
└── README.md               # Guide för att submita extensions
```

### registry.json Format

```json
{
  "$schema": "./schemas/registry.schema.json",
  "version": "1.0.0",
  "lastUpdated": "2024-12-27T12:00:00Z",
  "extensions": [
    {
      "id": "ollama-provider",
      "name": "Ollama AI Provider",
      "description": "Connect Stina to your local Ollama instance",
      "author": "Stina Team",
      "repository": "https://github.com/stina-app/stina-ext-ollama",
      "latestVersion": "1.0.0",
      "categories": ["ai-provider"],
      "downloads": 0,
      "verified": true
    }
  ]
}
```

### Per-Extension JSON (extensions/ollama-provider.json)

```json
{
  "id": "ollama-provider",
  "name": "Ollama AI Provider",
  "description": "Connect Stina to your local Ollama instance for private, offline AI conversations.",
  "author": {
    "name": "Stina Team",
    "url": "https://github.com/stina-app"
  },
  "repository": "https://github.com/stina-app/stina-ext-ollama",
  "license": "MIT",
  "categories": ["ai-provider"],
  "verified": true,
  "versions": [
    {
      "version": "1.0.0",
      "releaseDate": "2024-12-27",
      "minStinaVersion": "0.5.0",
      "platforms": ["web", "electron", "tui"],
      "downloadUrl": "https://github.com/stina-app/stina-ext-ollama/releases/download/v1.0.0/ollama-provider-1.0.0.zip",
      "sha256": "abc123...",
      "permissions": [
        "network:localhost:11434",
        "settings.register",
        "provider.register"
      ],
      "changelog": "Initial release"
    }
  ]
}
```

### Publiceringsprocess

```
1. Developer skapar extension enligt template
2. Developer testar lokalt med `stina ext dev`
3. Developer bygger release: `pnpm build && pnpm pack-extension`
4. Developer skapar GitHub release med .zip
5. Developer gör PR till stina-extensions-registry
   - Lägger till/uppdaterar extensions/<id>.json
   - Uppdaterar registry.json
6. Stina-team granskar:
   - Manifest valideras automatiskt
   - Kod granskas manuellt
   - Permissions verifieras som rimliga
7. PR mergas → CDN uppdateras automatiskt

```

---

## Repon som behövs

| Repo | Syfte |
|------|-------|
| `stina` (nuvarande) | Huvudapp med extension-host |
| `stina-extensions-registry` | Registry JSON + granskningsprocess |
| `stina-ext-ollama` | Ollama provider extension |
| `stina-extension-template` | Template för nya extensions |

---

## Open Questions (kvar)

1. **Extension Bundles**: Ska extensions bundlas med alla dependencies, eller ska vi ha ett delat dependency-system?

2. **Update Mechanism**: Hur ska extensions uppdateras? Auto-update eller manuellt?

3. **TUI-specifika extensions**: Hur hanterar vi extensions som kräver UI-komponenter i TUI?
