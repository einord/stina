# AGENTS – Stina snabbguide

## Kärnidé

- Monorepo (Bun workspaces) med tre klienter (`apps/desktop`, `apps/tui`, `apps/cli`) som alla konsumerar samma kärnpaket i `packages/`.
- `ChatManager` är centralen: den håller koll på meddelanden, ropar på valda LLM-provider och streamar deltas via EventEmitter.
- Varje konversation delas upp i `Interaction`-objekt som innehåller flera `InteractionMessage`. En interaction börjar när den första användaren/Stina-meddelandet sparas och samlar därefter alla verktyg/assistentsteg i samma grupp.
- Lokalt tillstånd och konfiguration sparas under `~/.stina/` (delas av alla klienter och kan påverka testkörningar).

## Viktiga paket

- `packages/core` – ChatManager, tool-runtime och provider-wrapper (OpenAI, Anthropic, Gemini, Ollama). Värd att läsa innan man ändrar interaktioner.
- `packages/store` – SQLite-datalager (`~/.stina/stina.db`) för chatthistorik (tabellerna `interactions` + `interaction_messages`), todo-poster och legacy-räknare. Övervakar filen för att hålla processer i synk.
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
  - `apps/cli/index.ts`, enkla kommandon `show`, `add`. Mest nyttigt för sanity checks (store/chat).

## Dataflöden

1. Alla klienter läser/uppdaterar chatten via `ChatManager` → `@stina/chat` → SQLite (`~/.stina/stina.db`).
2. `ChatManager.sendMessage` hämtar aktiv provider från `readSettings()`. Saknas provider → lägger info-meddelande.
3. Provider wrapper → HTTP till respektive API. Tool calls hanteras lokalt via `runTool` (`packages/core/src/tools.ts`). Toolresultat loggas som `info`-meddelande i store.
4. Work (todo)‑verktygen hanterar sina egna tabeller via `@stina/work` (Drizzle + module bootstrap), automeddelanden skrivs via `@stina/chat` repos.
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
- **Källfiler:** Översättningar finns i `packages/i18n/src/locales/en.ts` och `sv.ts` som TypeScript-objekt. JSON5-filerna (`.json5`) är källfiler för manuell redigering med radbrytningar och kommentarer.
- **Redigera översättningar:**:
  - Redigera `.json5`-filerna, så kommer `.ts`-filerna genereras vid nästa omstart av applikationen.
- Importera och använd i kod:
  - Vue-komponenter: `import { t } from '@stina/i18n'` och ersätt t.ex. `title="Settings"` med `:title="t('nav.settings')"`.
  - CLI/TUI/Node: `import { t } from '@stina/i18n'` och använd `t('cli.description')` etc.
  - AI-promptar: använd översättningsnycklar som `t('chat.system_prompt')` istället för inlinesträngar.
- Tillgänglighet: aria-labels, tooltips, placeholders och status-/felmeddelanden ska också hämtas via `t()`.
- Språktillägg: lägg till ny `.ts`-fil i `packages/i18n/src/locales/<lang>.ts` och importera + registrera i `packages/i18n/src/index.ts` (LOCALES-map). `initI18n()` väljer språk från `navigator.language` (renderer) eller `process.env.LANG` (Node) med fallback `en`.
- Variabler och datum: använd interpolering i översättningarna (t ex `t('todos.count_aria', { count })`) och bygg formaterade datum i koden innan du skickar in dem (t ex `{ date: format(...) }`).
- Godkänn kriterier: inga användarvända strängar i PR ska vara hårdkodade. Om du ser en hårdkodad sträng – flytta den till i18n.

## Nyttiga kommandon

- `bun install` – installera deps.
- `bun run dev:all` – full desktop-stack.
- `bun run dev:tui` / `bun run dev:cli` – övriga klienter.
- `bun run lint`, `bun run lint:fix`, `bun run format`.
- Skapa issue via GitHub CLI: `gh issue create --repo einord/stina --title "..." --body-file ...` (kräver inloggad gh).
- Lokalisering: uppdatera alltid `packages/i18n/src/locales/*.json5` (källor) – `.ts`-filerna ska inte ändras då de genereras.

## Desktop GUI – CSS, komponenter och filstruktur

- Använd nestad CSS i Vue-komponenter som speglar DOM-trädet. Föredra `>` för direkta barn för att undvika läckande regler och få tydlig hierarki (se `BaseModal.vue` som exempel).
- Återanvänd komponenter istället för att duplicera markup/stil. Extrahera gemensamma delar (t.ex. formulär, modal-skal) till små komponenter hellre än att bygga om dem per vy.
- Om en komponent bara används av en förälder, namnge filen enligt mönstret `Parent.Child.vue` och lägg den bredvid föräldern (t.ex. `WorkSettings.ProjectForm.vue`). Det signalerar att den är lokal och underlättar navigation i VS Code:s nestade filvy.
- Håll vyerna tunna: lägg MCP-specifik vylogik i egna komponenter (t.ex. `ToolsView.McpServerPanel.vue` och `ToolsView.McpServerModal.vue`) i samma mapp som föräldern, och låt föräldern bara orkestrera data/props om det behövs (tänk "Single responsibility" där det är möjligt). Återanvänd bas-komponenter (SubNav, BaseModal, ToolModulePanel, ToolItem, SimpleButton, osv) istället för custom markup.
- När du bygger formulär/modaler, återanvänd `BaseModal` + färdiga formulärkomponenter, och använd nested CSS under komponentens rot (undvik globala regler). Håll input/label-styling nära DOM-strukturen och undvik inline-stilar.
- CSS: använd bara varianter som speglar DOM-strukturen; undvik duplicerad styling mellan filer. Grupp-styla `.form-content`, `.form-header`, `.form-fields` etc. under roten så det syns vilken struktur som gäller.

### Todo/tidpunkt/påminnelser

- Använd termen **tidpunkt** (eng. \"timepoint\") i stället för \"deadline\". Heldagstodos markeras med `isAllDay`; tidpunkts-todos har klockslag + valfri `reminderMinutes` (0/5/15/30/60 eller null).
- Standardpåminnelse för tidpunkter och standardtid för heldagspåminnelse läses från settings (`todos.defaultReminderMinutes`, `todos.allDayReminderTime`, HH:MM). Tomt/ej satt = ingen standardpåminnelse.
- Scheduler ligger i kärnan (delad för desktop/TUI) och postar automatiska meddelanden till Stina: inför tidpunkter (t.ex. \"om 5 minuter infaller tidpunkten för X\") och dagliga sammanfattningar för heldagstodos vid konfigurerad tid.
- När Stina skickar `assistant`-meddelanden och appfönstret inte är i fokus ska desktop-klienten trigga native OS-notis (Electron Notification).

## Fallgropar

- `settings.enc` är krypterad; skriv aldrig in nycklar direkt där. Använd API:et.
- Electron-huvudprocess behöver rebuild (`bun run electron:build`) efter ändringar i `apps/desktop/electron/*` innan `dev:electron` startar.
- `ChatManager.newSession` de-bouncas (400 ms), så täta anrop ger inte flera info-meddelanden.
- Databas-scheman: Drizzle-tabeller och rå-SQL måste ha samma kolumnnamn (camelCase i schemat). Om du blandar snake/camel i SELECT/INSERT/UPDATE får du "no such column"-fel eller bind-fel. Säkerställ migrations som lägger till saknade camelCase-kolumner och använd `coalesce` om du måste läsa äldre kolumnnamn.
- SQLite binding: better-sqlite3 tillåter bara number/string/bigint/buffer/null. Om du skickar boolean/Date/objekt via `.run()` får du "can only bind..."-fel. Konvertera booleans till 0/1 och strängfält med en helper innan du kör rå-SQL.
- Migrationer: lägg alltid till migrations för nya kolumner (kolla `pragma_table_info`) och logga, men faila inte hårt om kolumnen redan finns. Vid större schemaändring, överväg att läsa/skriva med raw SQL tills Drizzle/typningen är i synk.

Med den här filen bör en framtida AI snabbt kunna lokalisera rätt modul och kommandon utan ytterligare context.
