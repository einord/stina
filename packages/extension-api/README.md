# @stina/extension-api

Type definitions and runtime helpers for building extensions for Stina (https://github.com/einord/stina).
Use this package to define your extension manifest, register tools/providers, and access the extension context.

## What this package is for

- Authoring Stina extensions (tools, providers, settings, commands, prompts).
- Typing `manifest.json` and runtime code with Stina's Extension API.
- Running extension code inside Stina's sandboxed worker via the runtime helper.

## Install

```bash
pnpm add @stina/extension-api
```

(Use npm or yarn if you prefer.)

## Minimal extension example

### 1) `manifest.json`

```json
{
  "id": "example.hello",
  "name": "Hello Extension",
  "version": "0.1.0",
  "description": "Adds a hello tool",
  "author": { "name": "Your Name" },
  "main": "dist/index.js",
  "permissions": ["tools.register"],
  "contributes": {
    "tools": [
      {
        "id": "example.hello",
        "name": "Hello",
        "description": "Returns a friendly greeting",
        "parameters": {
          "type": "object",
          "properties": {
            "name": { "type": "string" }
          }
        }
      }
    ]
  }
}
```

### 2) Extension entry point (`src/index.ts`)

```ts
import type { ExtensionModule } from '@stina/extension-api'
import { initializeExtension } from '@stina/extension-api/runtime'

const extension: ExtensionModule = {
  activate(context) {
    context.log.info('Hello extension activated', { id: context.extension.id })

    context.tools?.register({
      id: 'example.hello',
      name: 'Hello',
      description: 'Returns a friendly greeting',
      execute: async (params) => {
        const name = typeof params?.name === 'string' ? params.name : 'there'
        return { message: `Hello, ${name}!` }
      },
    })
  },
}

initializeExtension(extension)
```

### 3) Build output

Bundle your extension so that `manifest.json` points at the built file (`main`).
For example, compile to `dist/index.js` and publish the zip/release with:

```
manifest.json
src/
dist/
```

## Tools

Tools let your extension expose functionality that Stina's AI assistant can call on behalf of the user.

### Registering a tool

Tools are registered via:

1. **Manifest declaration** (`manifest.json`) – declares the tool's metadata
2. **Runtime registration** (`context.tools.register()`) – provides the execute logic

Both approaches require the `tools.register` permission in your manifest.

### Tool definition

```ts
context.tools?.register({
  id: 'my-extension.weather',
  name: 'Get Weather',
  description: 'Fetches current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  },
  execute: async (params) => {
    const weather = await fetchWeather(params.location)
    return { success: true, data: weather }
  },
})
```

### Localized names and descriptions

To make your extension accessible to users in different languages, you can provide localized `name` and `description` fields using the `LocalizedString` type:

```ts
type LocalizedString = string | Record<string, string>
```

You can provide either a simple string (for English-only extensions) or an object with language codes:

```ts
// Simple string (English only)
{
  name: 'Get Weather',
  description: 'Fetches current weather for a location',
}

// Localized for multiple languages
{
  name: {
    en: 'Get Weather',
    sv: 'Hämta väder',
    de: 'Wetter abrufen',
  },
  description: {
    en: 'Fetches current weather for a location',
    sv: 'Hämtar aktuellt väder för en plats',
    de: 'Ruft das aktuelle Wetter für einen Ort ab',
  },
}
```

**How it works for your users:**

- **In the UI:** Users see the tool name in their preferred language (if you've provided it).
- **For the AI:** The AI always receives the English version to ensure consistent behavior.
- **Fallback:** If a translation is missing, Stina falls back to English, then to the first available language.

### Tool result

Your `execute` function should return a `ToolResult`:

```ts
interface ToolResult {
  success?: boolean
  data?: unknown
  error?: string
}
```

### Tool confirmation

For tools that perform sensitive or potentially destructive actions (e.g., sending emails, deleting data, making purchases), you can require user confirmation before the tool executes.

Add a `confirmation` field to your tool definition:

```ts
context.tools?.register({
  id: 'my-extension.send-email',
  name: {
    en: 'Send Email',
    sv: 'Skicka e-post',
  },
  description: 'Sends an email to the specified recipient',
  parameters: {
    type: 'object',
    properties: {
      to: { type: 'string', description: 'Recipient email' },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body' },
    },
    required: ['to', 'subject', 'body'],
  },
  confirmation: {
    prompt: {
      en: 'Allow sending email to {{to}}?',
      sv: 'Tillåt att skicka e-post till {{to}}?',
    },
  },
  execute: async (params) => {
    // Only runs after user confirms
    await sendEmail(params.to, params.subject, params.body)
    return { success: true }
  },
})
```

You can also declare confirmation in `manifest.json`:

```json
{
  "contributes": {
    "tools": [
      {
        "id": "my-extension.send-email",
        "name": { "en": "Send Email", "sv": "Skicka e-post" },
        "description": "Sends an email",
        "confirmation": {
          "prompt": {
            "en": "Allow sending this email?",
            "sv": "Tillåt att skicka detta e-postmeddelande?"
          }
        }
      }
    ]
  }
}
```

**How confirmation works:**

1. When the AI calls the tool, Stina pauses execution and shows a confirmation dialog
2. The user sees the confirmation prompt (or a default "Allow {toolName} to run?")
3. The user can approve, deny, or deny with a custom message
4. If approved, the tool executes normally
5. If denied, the AI receives an error message explaining the denial

**Configuration options:**

- `confirmation.prompt` (optional): Custom prompt to show the user. Can be a string or localized object. If omitted, a generic prompt is shown.

**AI custom messages:**

The AI can provide a custom confirmation message by including a `_confirmationMessage` parameter when calling the tool. This allows context-aware prompts like "May I send an email to john@example.com about the project deadline?"

## Common patterns

- Use `contributes` in `manifest.json` for UI definitions.
- Use `context.tools?.register(...)` or `context.providers?.register(...)` at runtime.
- Always include the permission that matches what you register (`tools.register`, `provider.register`, etc.).
- Keep runtime code platform-agnostic; it runs in a sandboxed worker.
- Provide localized `name` and `description` to reach more users.

## Publish to Stina Extension Library

Extensions that should appear in the Stina Extension Library must be registered via a Pull Request to:
https://github.com/einord/stina-extensions-registry

## Real-world example

For a real, but still approachable example of a Stina extension in use, see:
https://github.com/einord/stina-ext-people

## Links

- Manifest types: `ExtensionManifest` in this package.
- Runtime helper: `@stina/extension-api/runtime`.
