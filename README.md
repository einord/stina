# Stina

Stina är en experimentell AI-assistent som hjälper användare att hålla koll på chatt, todo-listor, kalender och andra informationskällor. Projektet lever i ett Bun-baserat monorepo och erbjuder tre klienter som alla talar med samma kärn-API:

- **Desktop (GUI)** – Vue 3 + Vite + Electron.
- **TUI** – ett curses-gränssnitt byggt med Blessed.
- **CLI** – ett enkelt terminalgränssnitt via Commander.

> Mycket funktionalitet är under uppbyggnad, men koden är strukturerad så att du snabbt kan bygga vidare oavsett klient.

## Repo-layout

```
apps/
  desktop/   Vue/Electron-klienten
  tui/       Blessed-baserat terminalgränssnitt
  cli/       Commander-baserat CLI
packages/
  core/      ChatManager, providers, MCP-verktyg
  store/     SQLite-datalager för chatt/räknare + toolkit för verktyg i ~/.stina/stina.db
  settings/  Krypterade provider-inställningar, MCP-servrar
  crypto/    Nyckelhantering + AES-256-GCM-kryptering
  mcp/       Minimal MCP-klient ovanpå ws
```

Alias `@stina/*` pekar på motsvarande paket (se `tsconfig.json`).

## Förutsättningar

- **Bun ≥ 1.1** (krävs för `bunx`, scripts och runtime).
- Node.js 18+ (behövs av Electron och vissa verktyg).
- macOS, Linux eller Windows (Electron-byggskript stödjer alla tre, men GUI:t är optimerat för macOS-appearance).

Installera beroenden en gång:

```bash
bun install
```

## Starta klienterna

### Desktop (GUI + Electron)

Renderer och huvudprocess körs separat. Kör antingen två terminaler eller använd den samlade kommandot:

```bash
# Bygg huvudprocess + preload (krävs första gången eller vid ändringar)
bun run electron:build

# Terminal 1 – Vite devserver för Vue
bun run dev:desktop

# Terminal 2 – Starta Electron och peka den mot devservern
bun run dev:electron

# Alternativ: bygg + starta båda i ett kommando
bun run dev:all
```

`dev:electron` öppnar DevTools automatiskt. För snabbare iteration på huvudprocessen finns `bun run electron:watch` som bevakar `apps/desktop/electron/*` och skriver om bundle i `.electron/`.

### TUI

```bash
bun run dev:tui
```

Kortkommandon: `Esc` visar menyn, `c/x/s` byter vy, `t` visar todo-panelen, `T` växlar tema, `Ctrl+C` avslutar.

### CLI

```bash
# Visa räknaren (delas med övriga klienter)
bun run dev:cli show

# Öka värdet
bun run dev:cli add --by 5
```

Standardkommandot (utan subkommando) visar samma räknare.

### Produktion

```bash
bun run build:desktop
```

Skapar en statisk bundle i `apps/desktop/dist/`. Electron-packaging för produktion är ännu inte satt upp.

### Ikoner och logotyp

`assets/logo.png` fungerar som single-source-of-truth för appikonen. Innan desktop-klienten körs eller byggs körs scriptet `bun run generate:icons` automatiskt (hookat via `predev:*` och `prebuild:desktop`). Scriptet använder [Sharp](https://sharp.pixelplumbing.com/) för att ta fram PNG-varianter i storlekarna 16–512 px och sparar ut dem på två ställen:

- `apps/desktop/src/assets/icons/…` – importeras av Vue-komponenter (t.ex. chattbubblornas avatar).
- `apps/desktop/assets/icons/…` – packas med Electron och används som fönster-/dockikon.

Samma script kopierar även `assets/stina-avatar.png` till `apps/desktop/src/assets/avatars/` (Vue) och `apps/desktop/assets/avatars/` (packaged runtime) så att chattens avatar alltid får rätt grafik även när logotypen ändras. Vill du uppdatera någon av bilderna ersätter du respektive källa och kör `bun run generate:icons` manuellt (eller bara startar ett dev/build-kommando). Icon- och avatarfilerna är genererade artefakter – de kan checkas in för att slippa köra Sharp i CI, men går alltid att reproducera från källorna.

## Lokala inställningar och persistens

Alla klienter delar samma data under `~/.stina/`:

| Fil            | Innehåll                                                            |
| -------------- | ------------------------------------------------------------------- |
| `stina.db`     | SQLite-databas: obegränsad chatthistorik, todo-poster, räknare m.m. |
| `settings.enc` | Krypterade provider/MCP-inställningar. Krypteras med AES-256-GCM.   |
| `.k`           | (Fallback) lokal nyckel om Keychain/Keytar inte finns.              |

`stina.db` ersätter tidigare `state.json` (filen lämnas orörd om den finns kvar). Nyckeln för `settings.enc` lagras helst via `keytar` i OS keychain (`SERVICE=Stina`). Om du behöver börja om: ta backup och radera katalogen, eller kör `store.clearMessages()` via REPL.

### Todo-verktyg och automatiska meddelanden

Stina exponerar nu inbyggda verktyg som modeller kan använda:

- `todo_list`, `todo_add`, `todo_update` – CRUD-operationer mot en lokal todo-lista som lagras i SQLite. Verktygen accepterar/returnerar JSON-strukturer och visas för modellen via `list_tools`.

Verktygsmoduler som behöver posta automatiserade meddelanden i chatten kan anropa `store.appendAutomationMessage(toolName, text)` direkt. Historiken i databasen är obegränsad, men `toChatHistory()` skickar fortfarande högst 20 senaste user/assistant-paret till modellen för att hålla prompten kort. Behöver ett verktyg egen persistens registrerar det sina tabeller via `@stina/store/toolkit` och kör sina SQL-queries från samma modul som övriga verktygs-handlers.

### Konfigurera providers

`packages/settings` erbjuder helper-funktioner för att uppdatera inställningar programatiskt:

```ts
import { setActiveProvider, updateProvider } from '@stina/settings';

await updateProvider('openai', { apiKey: 'sk-…', model: 'gpt-4o-mini' });
await setActiveProvider('openai');
```

GUI:t exponerar samma IPC-ändpunkter (se `apps/desktop/electron/main.ts`).

### MCP-servrar

Lägg till Model Context Protocol-servrar via `upsertMCPServer`, sätt standard med `setDefaultMCPServer`, eller använd `listMCPServers` för att se vad som är registrerat. Inbyggda verktyg (`console_log`, `list_tools`, `mcp_list`, `mcp_call`) finns alltid tillgängliga via `ChatManager`.

Behöver en server OAuth? Ange `oauth.authorizationUrl`, `oauth.tokenUrl`, `oauth.clientId` och `oauth.redirectUri` i konfigurationen (GUI:t har motsvarande fält). Desktop-klienten öppnar då ett PKCE-flöde i ett separat fönster och lagrar token svaren krypterat i `settings.enc`. Tokens skickas som HTTP-headrar när MCP-klienten ansluter, så du slipper lägga API-nycklar i klartext.

## Debugga och felsöka

- **ChatManager-events** – Alla klienter lyssnar på `chat.onMessages`, `chat.onStream` och `chat.onWarning`. Lägg till egna listeners för att inspektera flöden.
- **Persistens** – Chatloggar sparas direkt efter varje append. I/O-fel loggas tyst, så kontrollera filrättigheter om historik uteblir.
- **SQLite** – allt innehåll (chatt, todos, räknare) ligger i `~/.stina/stina.db`. Ta en backup innan du manuellt ändrar den. Filen övervakas automatiskt så att flera processer hålls synkade.
- **Providerfel** – `ChatManager.sendMessage` fångar fel och skriver ett `assistant`-meddelande med texten `Error: …`. Sätt breakpoints i `packages/core/src/providers/*` för att se exakta HTTP-payloads.
- **Verktygsloggar** – Varje tool invocation loggas som `info`-meddelande i databasen (`stina.db`). I TUI syns dessa som centrerad text.
- **Electron** – IPC-kanaler definieras i `apps/desktop/electron/main.ts`. Använd `window.electronAPI` (se preload) för att felsöka renderer-sidan och öppna DevTools (`Cmd+Alt+I`).
- **TUI** – Sätt `DEBUG=blessed:* bun run dev:tui` för att se layoutfel. TUI stänger inte automatiskt på exception; processen avslutas med stacktrace.
- **Återställning** – Ta bort `~/.stina/stina.db` för att rensa innehåll (chat, todos, räknare) och radera `settings.enc` + `.k` för att nollställa konfiguration (du måste då lägga in API-nycklar igen).

## Kodstil och verktyg

```bash
bun run lint       # ESLint (TS + Vue)
bun run lint:fix   # Autofix
bun run format     # Prettier
```

Projektet använder ESM och strikt TypeScript-konfiguration (`tsconfig.json`). Följ gärna befintliga alias, undvik CommonJS.

## Nästa steg

- Implementera riktiga todo-/kalenderintegrationer (plats finns i GUI/TUI-views).
- Bygga färdigt Settings-vyerna för att slippa scripts.
- Paketera Electron för distribution (t.ex. via `electron-builder`).
- Skriva tester för `packages/core` (ChatManager, provider wrappers, MCP-klienten).

Välkommen att bygga vidare!
