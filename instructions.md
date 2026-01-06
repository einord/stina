Instruktioner till AI: Bootstrap TS monorepo (Vue + Fastify + Drizzle/SQLite + Extensions + Themes)

Det här är fortfarande “minsta nyttiga bootstrap”: vi skapar ramen för extensions + themes + DB-migrering, men vi implementerar bara ett “hello”-flöde och en enkel theme-loader som bas för att se att allt fungerar som det ska.

Applikationens namn: "Stina"
Versionsnummer börjar på: 0.5.0
⸻

Om applikationen

Stina är i huvudsak en AI-assistent i form av en chattapplikation. Syftet är att hjälpa användaren med sin arbetsdag, skolarbete eller andra projekt. Tanken är att användaren har Stina igång under hela arbetsdagen (eller hela tiden) och att hon kan:

    •	Svara på frågor och hjälpa till med uppgifter via chatt
    •	Påminna användaren om händelser i kalendern
    •	Komma ihåg uppgifter och påminna vid rätt tillfälle
    •	Integreras med andra verktyg via extensions

OBS: De applikationsspecifika funktionerna (chatt, kalender, påminnelser) implementeras inte i denna bootstrap – denna sektion finns för dokumentationens skull så att arkitekturen kan ta hänsyn till framtida behov.

⸻
Syfte

Skapa en minimal, välstrukturerad monorepo-bas i TypeScript där följande varianter kan startas lokalt och dela samma core:
• API-server (Fastify) – kör lokalt, ingen extern backend krävs
• TUI/CLI – kör lokalt och anropar core direkt
• Web UI (Vue) – pratar med lokala API-servern
• Electron renderer – ska dela UI-kod med Web via packages/ui-vue

I första bootstrapen ska alla varianter kunna köra samma core-funktion: getGreeting(name) (“Hello world”).

Dessutom ska det finnas en minimal men genomtänkt bas för:
• typed SQLite via Drizzle
• extensions som kan deklarera DB-behov, commands och UI contributions
• themes som är extensions (light/dark inbyggda men via samma mekanism)

Tekniska val (rekommenderade packages)

Monorepo:
• pnpm workspaces

Bygg & dev:
• tsup (packages)
• tsx (dev-runner för Node appar)
• TypeScript project references för typecheck (eller turbo/pnpm -r, håll det enkelt)

API:
• fastify
• @fastify/cors (för web dev)
• zod (valfritt men rekommenderat) för request/response-schema

DB (typed SQLite utan ren SQL):
• drizzle-orm
• drizzle-kit (för migration tooling)
• better-sqlite3 (driver)
• (valfritt) drizzle-zod om du vill generera zod-scheman från tabeller

CLI/TUI:
• commander (börja som CLI)
• TUI kan byggas med t.ex. neo-blessed eller egen renderer

Web UI:
• Vite + Vue
• pinia (valfritt)
• vue-router (valfritt – inte nödvändigt i bootstrap)

Lint/format:
• eslint
• prettier

Hård designprincip (måste följas) 1. packages/core är plattformsneutral: inga Node/Electron/HTTP/Vue-importer. 2. apps/\* är tunna wrappers som wires dependencies och anropar core. 3. DB och IO ligger i packages/adapters-node (Node-specifika adapters). 4. UI-komponenter som delas mellan Web och Electron ligger i packages/ui-vue. 5. Extensions ska bidra via declarative contributions (manifest + data + ev. sandboxad kod), inte fri åtkomst till process/FS per default. 6. Små filer, tydligt ansvar: inga megafiler.

⸻

Repo-struktur (ska skapas)

repo/
README.md # Dokumentation på engelska - Ska formatteras på ett sätt som är enkelt att förstå för en människa - tänk Github-presentation av projektet och hur man enklast kommer igång.
package.json
pnpm-workspace.yaml
tsconfig.base.json
.editorconfig
.gitignore
.prettierrc
eslint.config.js (eller .eslintrc.cjs)
vitest.config.ts

.vscode/
settings.json # format on save, lint on save
extensions.json # rekommenderade extensions

apps/
api/
package.json
tsconfig.json
src/
index.ts # startar server
server.ts # fastify setup
routes/
health.ts
hello.ts

    tui/
      package.json
      tsconfig.json
      src/
        index.ts              # entrypoint
        cli.ts                # commander wiring

    web/
      package.json
      tsconfig.json
      vite.config.ts
      index.html
      src/
        main.ts
        App.vue
        api/
          client.ts
        pages/
          HomePage.vue

    electron/
      package.json
      tsconfig.json
      src/
        main.ts               # Electron main process
        preload.ts            # preload script
      resources/              # icons etc.

packages/
shared/
package.json
tsconfig.json
src/
types.ts
index.ts

    core/
      package.json
      tsconfig.json
      src/
        hello/
          getGreeting.ts
        extensions/
          manifest.ts
          contributions.ts
          registry.ts
        themes/
          theme.ts
          themeRegistry.ts
        index.ts

    ui-vue/
      package.json
      tsconfig.json
      src/
        components/
          GreetingCard.vue
        theme/
          applyTheme.ts
        index.ts

    adapters-node/
      package.json
      tsconfig.json
      src/
        db/
          schema.ts            # core tables (drizzle)
          migrate.ts           # runs migrations (core + extensions)
          connection.ts        # better-sqlite3 + drizzle wiring
        extensions/
          loader.ts            # loads manifests from disk (data-only in bootstrap)
          builtins.ts          # built-in themes shipped with app
        index.ts

docs/
architecture.md
extensions.md
themes.md
database.md
decisions.md

⸻

“Hello” end-to-end krav

Shared types

packages/shared/src/types.ts:
• export type Greeting = { message: string; timestamp: string }

Core greeting

packages/core/src/hello/getGreeting.ts:
• export function getGreeting(name?: string): Greeting
• default name = "world"
• return { message: Hello, ${name}!, timestamp: new Date().toISOString() }

API

Routes:
• GET /health → { ok: true }
• GET /hello?name=Jonte → Greeting via getGreeting

Port:
• PORT env, fallback 3001

CLI (TUI v1)

Command:
• app hello → print message + timestamp
• app hello --name Jonte

CLI ska anropa core direkt, inte API.

Web (Vue)
• Input + knapp “Greet”
• Anropar /hello?name=... mot API
• Renderar resultatet med packages/ui-vue komponent GreetingCard

⸻

Typed SQLite med Drizzle (bootstrap-nivå)

Krav
• DB ska vara optional i bootstrap: vi wirear DB men använder den inte i hello-flödet.
• Vi ska ändå sätta upp:
• drizzle connection
• ett exempel på “core schema” (t.ex. app_meta table)
• en migrationsmekanism (minimal) som kan utökas av extensions

Drizzle schema (exempel)

I packages/adapters-node/src/db/schema.ts definiera minst en tabell med Drizzle DSL, t.ex. app_meta:
• key (primary key)
• value (text)
• updatedAt (text ISO)

Ingen raw SQL för att definiera tabeller i core: använd drizzle tabell-definitioner.

Migration approach (för bootstrap)

För att också kunna ta emot extension-tabeller på ett kontrollerat/säkert sätt:
• I bootstrap: använd en migrations-folder approach där migrationer är data (SQL-filer) eller drizzle-kit genererade.
• Core schema skapas via drizzle + drizzle-kit (på sikt). I bootstrap räcker att ha:
• en migrate(db, migrationsPath) funktion som kör SQL-migrationer i ordning.

Motivering: extensions kan inte få köra godtycklig TS för schema (säkerhetsrisk), men kan leverera migrationer i ett kontrollerat format.

Migrations-tabell
• En _migrations-tabell håller koll på vilka migrationer som körts: { name: string, appliedAt: string }
• Extensions får egna tabeller med prefix: ext_<extensionId>_<tablename> för att undvika kollisioner
• Extensions migrationer namnges: ext_<extensionId>_<timestamp>_<description>.sql

DB-plats
• Databasen skapas i användarens data-katalog:
• macOS: ~/Library/Application Support/Stina/data.db
• Linux: ~/.local/share/Stina/data.db
• Windows: %APPDATA%/Stina/data.db
• I dev-läge kan DB_PATH env override:a till lokal ./data/data.db

⸻

Extensions: säker modell + vad som ska implementeras nu

Extension goals (framtid)

Extensions ska kunna: 1. deklarera vilka DB-tabeller de behöver (via migrations) 2. registrera commands/tools som core kan exekvera 3. bidra med UI på ett säkert sätt (TUI och GUI) 4. bidra med themes (data-only)

Säkerhetsprincip
• Default: data-only extensions (manifest + assets + migrations + theme tokens + declarative UI contributions)
• Eventuell “exekverbar kod-extension” ska köras isolerat:
• Antingen som WASM med begränsat host-API (rekommenderat för untrusted)
• Eller som separat process (trusted publishers) med JSON-RPC och explicit permissions
• I bootstrap implementerar vi endast data-only (manifest parsing + theme loading + contributions registry). Ingen kodkörning ännu.

Manifest (måste definieras i core)

Skapa packages/core/src/extensions/manifest.ts:
• ExtensionManifest med fält:
• id: string (publisher.name)
• version: string (semver)
• name: string
• description?: string
• type: "feature" | "theme"
• engines: { app: string }
• permissions?: string[] (t.ex. "db", "ui", "network") – bara metadata i bootstrap
• contributes?: ExtensionContributions

Skapa packages/core/src/extensions/contributions.ts:
• ExtensionContributions kan innehålla:
• commands?: Array<{ id: string; title: string }> (declarativt)
• ui?: { webPanels?: Array<{ id: string; title: string; view: "settings" | "dashboard" | "custom" }> ; tuiPanels?: ... }
• themes?: Array<{ id: string; label: string; tokens: ThemeTokens }>
• migrations?: { folder: string } (path inom extension package)

Extension registry (core)

packages/core/src/extensions/registry.ts:
• En liten registry som kan:
• register(manifest: ExtensionManifest)
• list()
• getThemes() (via contributes.themes)
• getCommands() (via contributes.commands)

Loader (Node adapter)

packages/adapters-node/src/extensions/loader.ts:
• Läser extensions från användarens extensions-katalog:
• macOS: ~/Library/Application Support/Stina/extensions/
• Linux: ~/.local/share/Stina/extensions/
• Windows: %APPDATA%/Stina/extensions/
• I dev-läge kan EXTENSIONS_PATH env override:a till lokal ./extensions/ i repo.
• Varje extension ligger i en mapp med manifest.json.
• Loader returnerar ExtensionManifest[].

Extension-säkerhet
• Extensions laddas endast från den kontrollerade extensions-katalogen (inte godtyckliga paths)
• Framtid: extensions hämtas från ett eller flera konfigurerade GitHub-repon via appen
• Extensions måste ha giltig manifest.json för att laddas
• Data-only extensions (themes, declarative contributions) körs direkt
• Kod-extensions (framtid) kräver explicit användarbekräftelse vid installation

Built-in themes som extensions

packages/adapters-node/src/extensions/builtins.ts:
• Definiera två manifests i kod (light/dark) som följer samma schema som nedladdade theme extensions.
• Registrera dem alltid.

⸻

Themes: dynamisk laddning för Web + (förberedelse för TUI)

Theme tokens (core)

packages/core/src/themes/theme.ts:
• ThemeTokens är ett objekt med design-tokens (dot-notation):
• main.windowBackground, main.windowForeground
• accent.primary, accent.primaryText
• surface.muted, surface.mutedText, surface.border
• state.danger, state.success, state.warning
• layout.radius, layout.spacing (valfritt)
• dev.appBackgroundTest (valfritt)

packages/core/src/themes/themeRegistry.ts:
• kan registerTheme(id, label, tokens)
• kan getTheme(id)
• kan listThemes()

Web theming (ui-vue)

packages/ui-vue/src/theme/applyTheme.ts:
• Funktion applyTheme(tokens: ThemeTokens) som sätter CSS variables på :root, t.ex.
• --theme-main-window-background, --theme-main-window-foreground, --theme-accent-primary, etc.

Web app:
• Vid start: hämta valt theme från inställningsfilen (via API), fallback till "dark"
• Anropa applyTheme(...)
• Theme-val sparas i den krypterade inställningsfilen, synkas mellan alla appar (Web, Electron, TUI)

TUI theming (förberedelse)
• I bootstrap räcker att CLI skriver ut valt theme-id.
• Dokumentera i docs/themes.md hur TUI kan använda samma tokens (t.ex. mappa tokens till ANSI-färger med chalk).

⸻

API: endpoints för themes/extensions (bootstrap)

Lägg till:
• GET /themes -> lista themes (id + label)
• GET /themes/:id -> tokens

Och:
• GET /extensions -> lista registrerade extensions (id, name, version, type)

⸻

Dev scripts (root package.json)

Krav:
• pnpm dev:api -> starta apps/api + apps/web parallellt
• pnpm dev:electron -> starta Electron-appen
• pnpm dev:tui -> kör CLI
• pnpm build, pnpm typecheck, pnpm lint
• pnpm test -> kör smoke tests med vitest
• pnpm test:watch -> vitest i watch mode

Utöka inte med fler scripts än dessa, för att hålla det rent, snyggt och enkelt för nya i projektet att starta upp.

⸻

Felhantering och logging

Core error types (packages/core)
• Definiera AppError-klass med: code, message, context?, cause?
• Definiera Result<T, E> type för funktioner som kan misslyckas
• Felkoder kategoriseras: VALIDATION*\*, DB*_, EXTENSION\__, CONFIG\_\*, etc.

Logging interface (packages/core)
• Definiera Logger interface i core: { debug, info, warn, error }
• Core tar emot logger via dependency injection, loggar aldrig direkt

Adapter-specifik implementation (packages/adapters-node)
• Implementera Logger för Node med olika targets:
• API: loggar till stdout/stderr (för container/server-miljö)
• Electron: loggar till OS-specifik logg + eventuellt fil i app-katalogen
• TUI/CLI: loggar till stderr (stdout reserverat för output)
• Log levels styrs via LOG_LEVEL env (debug/info/warn/error)

Felhantering per app
• API: mappar AppError till HTTP-statuskoder, returnerar strukturerad JSON { error: { code, message } }
• TUI: skriver felmeddelande till stderr med färgkod (rött för error)
• Web/Electron: visar användarvänligt felmeddelande i UI, loggar detaljer till konsol/fil

⸻

Konfiguration och inställningar

App-katalog
• macOS: ~/Library/Application Support/Stina/
• Linux: ~/.local/share/Stina/
• Windows: %APPDATA%/Stina/

Katalogstruktur:
• data.db – SQLite-databas
• config.enc – krypterad inställningsfil (JSON krypterat med app-nyckel)
• extensions/ – installerade extensions
• logs/ – loggfiler (för Electron/desktop)

Inställningsfil (config.enc)
• Krypteras med en nyckel deriverad från en app-secret (kan vara maskinspecifik eller användardefinierad)
• Dekrypterat format: JSON med namespaces
• Kan innehålla känslig data: API-nycklar, lösenord, tokens

Inställningsstruktur (exempel):

```json
{
  "app": {
    "theme": "dark",
    "locale": "sv-SE",
    "user": { "name": "Jonte", "email": "..." }
  },
  "extensions": {
    "publisher.extension-name": { ... extension-specifika settings ... }
  }
}
```

Settings API (packages/core)
• Definiera SettingsStore interface:
• get<T>(namespace: string, key: string): T | undefined
• set(namespace: string, key: string, value: unknown): void
• getNamespace(namespace: string): Record<string, unknown>
• Core "app" namespace är read-only för extensions
• Extensions får läsa/skriva till sitt eget namespace: extensions.<extensionId>

Adapter implementation (packages/adapters-node)
• Implementera EncryptedSettingsStore som läser/skriver config.enc
• Använd t.ex. Node crypto med AES-256-GCM
• Lazy-load: dekryptera vid första läsning, cacha i minnet
• Flush till disk vid ändringar (debounced)

⸻

Testing

Test-framework
• vitest för unit/integration tests
• Tester placeras i **tests**/ mappar bredvid källkod, eller i tests/ i varje package

Bootstrap test-krav (smoke tests)
• packages/core: testa getGreeting(), extension registry, theme registry
• packages/adapters-node: testa settings store (med temp-fil), migrations
• apps/api: testa endpoints med supertest eller liknande
• apps/tui: testa CLI-kommando output

CI-redo scripts
• pnpm test – kör alla tester
• pnpm test:coverage – med coverage rapport
• pnpm lint – ESLint
• pnpm typecheck – tsc --noEmit

VSCode-inställningar (.vscode/settings.json)

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

Rekommenderade VSCode extensions (.vscode/extensions.json)

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "vue.volar",
    "bradlc.vscode-tailwindcss"
  ]
}
```

⸻

Dokumentation som måste skapas

docs/architecture.md:
• core vs adapters vs apps vs ui-vue
• hur web/electron delar ui via ui-vue

docs/extensions.md:
• manifest schema
• data-only vs sandboxed code (WASM/process) som framtidsplan
• hur migrations fungerar för extensions

docs/database.md:
• drizzle + better-sqlite3 setup
• migration strategy
• varför extensions levererar migrations som data

docs/themes.md:
• theme tokens
• hur applyTheme funkar i web
• framtida mapping till TUI

docs/decisions.md:
• lista teknikval och motiv

docs/configuration.md:
• app-katalog per OS
• krypterad inställningsfil
• settings API och namespaces

docs/error-handling.md:
• AppError och Result-typer
• Logger interface
• felhantering per app-typ

⸻

Output-krav (vad AI ska generera) 1. Komplett filstruktur + innehåll för alla nödvändiga filer 2. Minimal kod, små filer, inget extra fluff 3. Allt ska bygga och kunna köras:
• pnpm dev startar API + Web
• pnpm tui hello --name Test funkar
• Web kan anropa API /hello
• /themes och /extensions funkar 4. Inga extensions “store/download” än – bara lokal folder loader + built-in themes som sätter exempel på hur nerladdade tokens i framtiden behöver byggas

⸻

Efter-checklista
• curl http://localhost:3001/hello?name=Test -> Greeting JSON
• curl http://localhost:3001/themes -> themes list
• pnpm tui -- hello --name Test -> printar greeting
• packages/core importerar inte Node/Vue/Fastify
• packages/ui-vue importerar inte apps/\*
• pnpm test -> alla smoke tests passerar
• pnpm lint -> inga fel
• pnpm typecheck -> inga typfel
• Electron-appen startar och visar samma UI som web

⸻

Paketförslag (sammanfattning)
• Core/shared: typescript
• API: fastify, @fastify/cors, zod
• DB: drizzle-orm, drizzle-kit, better-sqlite3
• CLI: commander
• Web: vue, @vitejs/plugin-vue, vite
• Electron: electron, electron-builder
• Testing: vitest, @vitest/coverage-v8
• Tooling: tsup, tsx, eslint, prettier
