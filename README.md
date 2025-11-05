# Pro Assist Monorepo

Pro Assist är en kombinerad desktop- och CLI-app för att hantera uppgifter, projekt och schemalagda påminnelser med stöd för flera AI-leverantörer via ett gemensamt kärnlager.

## Struktur

```
.
├── apps
│   ├── desktop   # Tauri + Vue 3-klient
│   └── cli       # oclif-baserad CLI
├── core          # Delat domänlager (AI, data, verktyg, MCP, policy)
├── packages
│   └── tool-runner  # Node-brygga som exponerar verktygs-API:et
├── scripts       # Ex. seed.ts för att fylla databasen
├── data          # SQLite-databas (skapas vid körning)
└── examples/mcp  # Exempel på MCP-integrationer
```

## Förkrav

- Node.js >= 18.17
- pnpm eller npm (exemplen nedan använder npm)
- Rust (för Tauri)
- SQLite (medföljer macOS/Linux; Windows via bundling)

## Kom igång

Installera beroenden i hela monorepot:

```
npm install
```

Bygg kärnan och verktygen:

```
npm run build -- --filter="core" --filter="@pro-assist/tool-runner"
```

Kör seed-scriptet för att skapa demodata:

```
npm run seed
```

### Desktop-app

1. Bygg `@pro-assist/tool-runner` (Tauri använder den som sidecar):

   ```
   npm run --workspace=@pro-assist/tool-runner build:all
   ```

2. Starta Tauri (i ett separat terminalfönster):

   ```
   cd apps/desktop
   npm install
   npm run tauri dev
   ```

   Kommandot startar Vite dev-servern och Tauri med delad SQLite-databas.

### CLI

Bygg och länka CLI:n:

```
npm run --workspace=@pro-assist/cli build
```

Kör kommandon via `node` eller lägg till `dist/index.cjs` på PATH.

Exempel:

```
node apps/cli/dist/index.cjs todo add "Skriv statusrapport"
node apps/cli/dist/index.cjs todo ls
node apps/cli/dist/index.cjs chat --provider mock
```

### MCP-exempel

I `examples/mcp` finns två skript som visar hur `@pro-assist/core` kan prata med en MCP-server.
Det räcker att sätta URL och (för Slack) token i miljövariabler, t.ex.:

```
node examples/mcp/docker.ts --server ws://localhost:8080
```

## Databas & migrationer

- `core/drizzle.config.ts` definierar schemat och migrationskatalogen.
- Databasen lagras som standard i `./data/pro-assist.db`.
- Kör `npm run --workspace=@pro-assist/core build` efter schemaändringar för att få uppdaterad typinformation.

## Testning

```
npm run --workspace=@pro-assist/core test
```

## Säkerhet

- Provider-konfigurationer krypteras lokalt via OS Keychain (`keytar`) med automatisk fallback till en processvariabel.
- API-nycklar kan sättas via CLI (`proassist settings key <provider> <nyckel>`) eller via desktop-inställningar.

## Arkitektur i korthet

- **core/ai** – gemensamt gränssnitt för AI-leverantörer (OpenAI, Anthropic, Ollama, Mock).
- **core/data** – SQLite + Drizzle ORM för lagring av todo/projekt/scheman/instruktioner.
- **core/tools** – deterministiska verktygsfunktioner som används av både CLI och desktop via `@pro-assist/tool-runner`.
- **core/mcp** – generisk MCP-klient över WebSocket.
- **core/scheduler** – cron-baserad schemaläggare som kan trigga nya sessioner.
- **packages/tool-runner** – Node-script som kör verktygen och agerar brygga mellan frontend (Tauri) och kärnlogiken.

## Nästa steg / TODO

- Fler enhetstester (core/tools) och integreringstester för CLI.
- Färdigställ MCP-serverexempel (slack/docker) eller koppla mot riktiga implementationer.
- TUI-gränssnitt (t.ex. via Ink) för trepanelsvy.
- Automatiska export/import-flöden samt read-only-läge i UI.

## Licens

MIT
