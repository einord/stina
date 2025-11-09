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
4. Todo-verktygen hanterar sina egna tabeller via `@stina/store/toolkit`, så all logik (schema + queries) bor i samma modul som själva verktyget. Automatiska chattsvar skrivs via `store.appendAutomationMessage()`.
5. MCP-stöd: `list_tools`/`mcp_list`/`mcp_call` proxas via `@stina/mcp`. MCP-servrar lagras i settings (`mcp.servers`).

## Tips för AI-agenten

- Dokumentera varje funktion med en kort docblock (`/** ... */`) som beskriver syfte + när den ska användas. Ta gärna med parametrar. Exempel:
  ```ts
  /**
   * Adds things to stuff when other things happen.
   * @param param1 Used for stuff.
   */
  function doStuff(param1: string) { ... }
  ```
- Behöver du konfiguration? Använd helper-funktionerna i `@stina/settings` istället för att handla direkt med krypterade filer.
- Vill du mocka en provider? Skapa en klass som implementerar `Provider` i `packages/core/src/providers/types.ts` och injicera via `createProvider`.
- För att rensa tillstånd: ta bort `~/.stina/stina.db` (data) eller kör `store.clearMessages()`/todo-funktionerna. För config, nolla `settings.enc`.
- Debug-loggar kan skrivas via `console.log` i vilken process som helst; TUI mutar `setToolLogger(() => {})`, men du kan koppla in en egen logger om du vill se tool-spårning i terminalen.
- Alla scripts körs med Bun; glöm inte `workdir` om du exekverar via Codex CLI.
- Nya verktyg: `todo_list`, `todo_add`, `todo_update` för att manipulera todo-listan. Automatiserade meddelanden skrivs i stället direkt via `store.appendAutomationMessage()`.
- När du bygger ett nytt verktyg, använd `@stina/store/toolkit` för att registrera tabeller och köra SQL-frågor så att all logik stannar i samma modul som verktyget.

### i18n – ALL användartext och AI-promptar via översättningar

- Hårdkoda aldrig användarvänd text (GUI/TUI/CLI) eller AI-promptar i koden. Använd alltid översättningsfunktionen `t()` från paketet `@stina/i18n`.
- Lägg nya texter som nycklar i `packages/i18n/src/locales/en.json` och `sv.json`. Använd interpolering med `{{name}}`/`{{count}}` etc vid behov.
- Importera och använd i kod:
  - Vue-komponenter: `import { t } from '@stina/i18n'` och ersätt t.ex. `title="Settings"` med `:title="t('nav.settings')"`.
  - CLI/TUI/Node: `import { t } from '@stina/i18n'` och använd `t('cli.description')` etc.
  - AI-promptar: använd översättningsnycklar som `t('chat.system_prompt')` istället för inlinesträngar.
- Tillgänglighet: aria-labels, tooltips, placeholders och status-/felmeddelanden ska också hämtas via `t()`.
- Språktillägg: lägg till ny språkfil `packages/i18n/src/locales/<lang>.json` och registrera i `packages/i18n/src/index.ts` (LOCALES-map). `initI18n()` väljer språk från `navigator.language` (renderer) eller `process.env.LANG` (Node) med fallback `en`.
- Variabler och datum: använd interpolering i översättningarna (t ex `t('todos.count_aria', { count })`) och bygg formaterade datum i koden innan du skickar in dem (t ex `{ date: format(...) }`).
- Godkänn kriterier: inga användarvända strängar i PR ska vara hårdkodade. Om du ser en hårdkodad sträng – flytta den till i18n.

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
