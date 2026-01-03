# @stina/i18n

Internationalization (i18n) package för Stina.

## Översikt

Detta paket hanterar alla översättningar för Stina-applikationen. Översättningar används för användartexter, felmeddelanden, AI-promptar och mer.

## Filstruktur

- **`src/locales/*.json5`** – JSON5-källfiler för översättningar. **Redigera dessa!**
- **`src/locales/*.ts`** – Auto-genererade TypeScript-filer (gitignored). **Redigera INTE dessa!**
- **`scripts/generate-locales.ts`** – Build-script som genererar `.ts` från `.json5`.
- **`src/index.ts`** – Huvudfilen som exporterar `t()`, `initI18n()` och `getLang()`.

## Användning

```typescript
import { t } from '@stina/i18n';

// Enkel översättning
const title = t('app.title'); // "Stina"

// Med interpolering
const count = t('todos.count_aria', { count: 5 }); // "Number of open todos: 5"
```

## Lägga till nya översättningar

**Redigera endast `.json5`-filerna!** TypeScript-filerna genereras automatiskt.

### Exempel: Lägga till en ny översättning

Öppna `src/locales/en.json5`:

```json5
{
  app: {
    title: 'Stina',
    new_key: 'New value here', // Lägg till din översättning
  },
}
```

Upprepa för `src/locales/sv.json5`:

```json5
{
  app: {
    title: 'Stina',
    new_key: 'Nytt värde här',
  },
}
```

### Generera TypeScript-filer

TypeScript-filerna genereras automatiskt när du kör:

```bash
# Manuellt
bun run generate:locales

# Automatiskt vid dev/build
bun run dev:all         # Genereras automatiskt
bun run dev:desktop     # Genereras automatiskt
bun run build:desktop   # Genereras automatiskt
```

### JSON5-fördelar

- **Kommentarer:** `// Detta är en kommentar`
- **Trailing commas:** Sista kommat är OK
- **Multiline-strängar:** Radbrytningar direkt i strängen
- **Inga quotes på nycklar**

Exempel:

```json5
{
    chat: {
        // Denna prompt används vid nya sessioner
        system_prompt: 'You are Stina.

This text spans multiple lines
without needing to escape anything!',
    },
}
```

## Lägga till nytt språk

1. Skapa `src/locales/<lang>.ts`:

   ```typescript
   export default {
     app: {
       title: 'Stina',
       // ... resten av översättningarna
     },
   };
   ```

2. Importera och registrera i `src/index.ts`:

   ```typescript
   import de from './locales/de.js';
   import en from './locales/en.js';
   import sv from './locales/sv.js';

   // Ny import

   const LOCALES: Record<string, LocaleMap> = {
     en,
     sv,
     de, // Registrera här
   };
   ```

3. (Valfritt) Skapa en JSON5-fil för enklare redigering: `src/locales/<lang>.json5`

## Interpolering

Använd `{{variabelnamn}}` i översättningarna:

```typescript
// I locale-filen:
{
  welcome: 'Hello {{name}}, you have {{count}} messages.';
}

// I koden:
t('welcome', { name: 'Alice', count: 3 });
// → "Hello Alice, you have 3 messages."
```

## Tekniska detaljer

- **Runtime:** Översättningarna importeras som vanliga ES-moduler (`.js`-filer efter kompilering).
- **JSON5:** Används endast som källformat för enklare redigering. JSON5-parsern (`json5`-paketet) används inte i runtime.
- **Cross-platform:** Fungerar i Node.js, Electron main process, Electron renderer och webbläsare.
