# Configuration

Stina stores user settings in an encrypted configuration file.

## App Data Directory

All app data is stored in an OS-specific location:

| OS      | Path                                   |
| ------- | -------------------------------------- |
| macOS   | `~/Library/Application Support/Stina/` |
| Linux   | `~/.local/share/Stina/`                |
| Windows | `%APPDATA%/Stina/`                     |

### Directory Structure

```
Stina/
  data.db           # SQLite database
  config.enc        # Encrypted settings file
  extensions/       # Installed extensions
  logs/             # Log files (desktop only)
```

## Settings File (config.enc)

Settings are stored in an encrypted JSON file using AES-256-GCM encryption.

### Encryption

- Algorithm: AES-256-GCM
- Key derivation: scrypt from app secret
- Format: `[16 bytes IV][16 bytes auth tag][encrypted data]`

### Decrypted Structure

```json
{
  "app": {
    "theme": "dark",
    "locale": "sv-SE",
    "user": {
      "name": "Jonte",
      "email": "jonte@example.com"
    }
  },
  "extensions": {
    "myname.todo": {
      "showCompleted": true,
      "sortOrder": "date"
    }
  }
}
```

## Namespaces

### `app` Namespace

Core application settings. **Read-only for extensions**.

| Key          | Type   | Description         |
| ------------ | ------ | ------------------- |
| `theme`      | string | Current theme ID    |
| `locale`     | string | UI language         |
| `user.name`  | string | User's display name |
| `user.email` | string | User's email        |

### `extensions` Namespace

Extension-specific settings. Each extension can read/write its own namespace.

Format: `extensions.<extensionId>.<key>`

## Settings API

### Core Interface

```typescript
interface SettingsStore {
  get<T>(namespace: string, key: string): T | undefined
  set(namespace: string, key: string, value: unknown): void
  getNamespace(namespace: string): Record<string, unknown>
  delete(namespace: string, key: string): void
  flush(): Promise<void>
}
```

### Usage

```typescript
import { EncryptedSettingsStore, deriveKey, getConfigPath } from '@stina/adapters-node'

// Create settings store
const key = deriveKey('my-secret')
const settings = new EncryptedSettingsStore(getConfigPath(), key)

// Read app settings
const theme = settings.get<string>('app', 'theme') // 'dark'

// Write extension settings
settings.set('extensions.myname.todo', 'showCompleted', true)

// Persist changes
await settings.flush()
```

### Extension Access Rules

1. Extensions can read from `app` namespace
2. Extensions can only write to their own `extensions.<extensionId>` namespace
3. Extensions cannot access other extensions' settings

## Environment Variables

| Variable          | Description              | Default      |
| ----------------- | ------------------------ | ------------ |
| `DB_PATH`         | Override database path   | (OS default) |
| `EXTENSIONS_PATH` | Override extensions path | (OS default) |
| `LOG_LEVEL`       | Logging level            | `info`       |
| `PORT`            | API server port          | `3001`       |
| `HOST`            | API server host          | `0.0.0.0`    |

## Security Considerations

1. **Encryption Key**: The encryption key is derived from an app secret. In production, this should be stored securely (e.g., system keychain).

2. **Sensitive Data**: API keys, passwords, and tokens can be stored in config.enc, but consider using OS keychain for maximum security.

3. **File Permissions**: The config.enc file should only be readable by the current user.

4. **Backup**: Encrypted backups can be made by copying config.enc, but the decryption key must be stored separately.
