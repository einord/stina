# Extensions

Extensions allow Stina to be extended with new functionality, themes, and integrations.

## Extension Types

- **theme**: Provides color themes for the UI
- **feature**: Adds commands, UI panels, or other functionality (future)

## Manifest Schema

Every extension must have a `manifest.json` file:

```json
{
  "id": "publisher.extension-name",
  "version": "1.0.0",
  "name": "My Extension",
  "description": "What this extension does",
  "type": "theme",
  "engines": {
    "app": ">=0.5.0"
  },
  "permissions": ["ui"],
  "contributes": {
    "themes": [
      {
        "id": "my-theme",
        "label": "My Theme",
        "tokens": {
          "background": "#ffffff",
          "foreground": "#000000",
          "primary": "#6366f1",
          "primaryText": "#ffffff",
          "muted": "#f3f4f6",
          "mutedText": "#6b7280",
          "border": "#e5e7eb",
          "danger": "#ef4444",
          "success": "#22c55e",
          "warning": "#f59e0b"
        }
      }
    ]
  }
}
```

## Contributions

Extensions can contribute:

### Themes

```json
{
  "contributes": {
    "themes": [
      {
        "id": "theme-id",
        "label": "Display Name",
        "tokens": { ... }
      }
    ]
  }
}
```

### Commands (Future)

```json
{
  "contributes": {
    "commands": [
      {
        "id": "extension.myCommand",
        "title": "My Command"
      }
    ]
  }
}
```

### UI Panels (Future)

```json
{
  "contributes": {
    "ui": {
      "webPanels": [
        {
          "id": "panel-id",
          "title": "My Panel",
          "view": "dashboard"
        }
      ]
    }
  }
}
```

### Database Migrations (Future)

```json
{
  "contributes": {
    "migrations": {
      "folder": "migrations"
    }
  }
}
```

## Security Model

### Data-Only Extensions (Current)

- Parse manifest.json
- Load theme tokens
- Register declarative contributions
- No code execution

### Sandboxed Code Extensions (Future)

For extensions that need to execute code:

1. **WASM Sandbox** (recommended for untrusted)
   - Limited host API
   - Memory isolation
   - No filesystem access

2. **Process Isolation** (trusted publishers)
   - Separate process with JSON-RPC
   - Explicit permission requests
   - User approval required

## Extension Installation Location

Extensions are installed to the app's data directory:

- **macOS**: `~/Library/Application Support/Stina/extensions/`
- **Linux**: `~/.local/share/Stina/extensions/`
- **Windows**: `%APPDATA%/Stina/extensions/`

Each extension is a folder containing at minimum `manifest.json`:

```
extensions/
  publisher.my-theme/
    manifest.json
  publisher.my-feature/
    manifest.json
    migrations/
      001_initial.sql
```

## Permissions

Extensions can request permissions:

- `ui`: Access UI contribution points
- `db`: Access database (own tables only)
- `network`: Make network requests
- `filesystem`: Read/write files (sandboxed)

In the current bootstrap, permissions are metadata only. Enforcement will be added with sandboxed code execution.
