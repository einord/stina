# AGENTS – Stina snabbguide

## Kärnidé

- Monorepo (Bun workspaces) med tre klienter (`apps/desktop`, `apps/tui`, `apps/cli`) som alla konsumerar samma kärnpaket i `packages/`.
- `ChatManager` är centralen: den håller koll på meddelanden, ropar på valda LLM-provider och streamar deltas via EventEmitter.
- Lokalt tillstånd och konfiguration sparas under `~/.stina/` (delas av alla klienter och kan påverka testkörningar).

## Viktiga paket

- `packages/core` – ChatManager, tool-runtime och provider-wrapper (OpenAI, Anthropic, Gemini, Ollama). Värd att läsa innan man ändrar interaktioner.
- `packages/store` – SQLite-datalager (`~/.stina/stina.db`) för chatthistorik, todo-poster och legacy-räknare. Övervakar filen för att hålla processer i synk.
- `packages/settings` – läser/krypterar provider-konfiguration. Funktioner (`readSettings`, `updateProvider`, `setActiveProvider`, MCP-hantering) används av Electron-IPCs och kan köras direkt i scripts.
- `packages/crypto` – nyckelhantering (keytar + fallback-fil `.k`). Ändras sällan men påverkar hela settings-formatet.
- `packages/mcp` – WebSocket-baserad MCP-klient. `callMCPTool` och `listMCPTools` används via `packages/core/src/tools.ts`.

## Klienter

- **Desktop (Electron + Vue)**
  - Renderer: `apps/desktop/src`, startas via `bun run dev:desktop`.
  - Huvudprocess: `apps/desktop/electron/main.ts`, bundlas till `apps/desktop/.electron`. IPC-kanaler: `chat:*`, `settings:*`, `mcp:*`.
  - Snabbstart: `bun run dev:all` (bygger preload & kör både Vite + Electron). Produktionsbundle: `bun run build:desktop` (endast renderer).
- **TUI**
  - Entrypoint `apps/tui/index.ts`. Blessed UI med vyer `chat/tools/settings`. Kortkommandon: `Esc`, `c/x/s`, `t`, `T`, `PgUp/PgDn`.
  - Start: `bun run dev:tui`.
- **CLI**
  - `apps/cli/index.ts`, enkla kommandon `show`, `add`. Mest nyttigt för sanity checks av delen `@stina/store`.

## Dataflöden

1. Alla klienter läser/uppdaterar chatten via `ChatManager` → `@stina/store` → SQLite (`~/.stina/stina.db`).
2. `ChatManager.sendMessage` hämtar aktiv provider från `readSettings()`. Saknas provider → lägger info-meddelande.
3. Provider wrapper → HTTP till respektive API. Tool calls hanteras lokalt via `runTool` (`packages/core/src/tools.ts`). Toolresultat loggas som `info`-meddelande i store.
4. Todo-verktygen skriver direkt till SQLite via `@stina/store`, vilket gör att alla klienter ser ändringar utan att modellen behöver vara inblandad. Om ett verktyg behöver posta automatiska meddelanden i chatten görs det genom `store.appendAutomationMessage()`.
5. MCP-stöd: `list_tools`/`mcp_list`/`mcp_call` proxas via `@stina/mcp`. MCP-servrar lagras i settings (`mcp.servers`).

## Tips för AI-agenten

- Behöver du konfiguration? Använd helper-funktionerna i `@stina/settings` istället för att handla direkt med krypterade filer.
- Vill du mocka en provider? Skapa en klass som implementerar `Provider` i `packages/core/src/providers/types.ts` och injicera via `createProvider`.
- För att rensa tillstånd: ta bort `~/.stina/stina.db` (data) eller kör `store.clearMessages()`/todo-funktionerna. För config, nolla `settings.enc`.
- Debug-loggar kan skrivas via `console.log` i vilken process som helst; TUI mutar `setToolLogger(() => {})`, men du kan koppla in en egen logger om du vill se tool-spårning i terminalen.
- Alla scripts körs med Bun; glöm inte `workdir` om du exekverar via Codex CLI.
- Nya verktyg: `todo_list`, `todo_add`, `todo_update` för att manipulera todo-listan. Automatiserade meddelanden skrivs i stället direkt via `store.appendAutomationMessage()`.

## Nyttiga kommandon

- `bun install` – installera deps.
- `bun run dev:all` – full desktop-stack.
- `bun run dev:tui` / `bun run dev:cli` – övriga klienter.
- `bun run lint`, `bun run lint:fix`, `bun run format`.

## Fallgropar

- `settings.enc` är krypterad; skriv aldrig in nycklar direkt där. Använd API:et.
- Electron-huvudprocess behöver rebuild (`bun run electron:build`) efter ändringar i `apps/desktop/electron/*` innan `dev:electron` startar.
- `ChatManager.newSession` de-bouncas (400 ms), så täta anrop ger inte flera info-meddelanden.

Med den här filen bör en framtida AI snabbt kunna lokalisera rätt modul och kommandon utan ytterligare context.
