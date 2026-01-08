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

## Common patterns

- Use `contributes` in `manifest.json` for UI definitions.
- Use `context.tools?.register(...)` or `context.providers?.register(...)` at runtime.
- Always include the permission that matches what you register (`tools.register`, `provider.register`, etc.).
- Keep runtime code platform-agnostic; it runs in a worker.

## Publish to Stina Extension Library

Extensions that should appear in the Stina Extension Library must be registered via a Pull Request to:
https://github.com/einord/stina-extensions-registry

## Links

- Manifest types: `ExtensionManifest` in this package.
- Runtime helper: `@stina/extension-api/runtime`.
