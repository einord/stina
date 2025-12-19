# Stina

> AI assistant for your workday

Stina is a local-first AI assistant application that helps you manage your daily tasks, calendar events, and reminders. It runs on your machine with no external backend required.

## Features (Planned)

- 💬 **AI Chat** - Conversational interface to help with tasks
- 📅 **Calendar Integration** - Get reminded about upcoming events
- ✅ **Task Management** - Remember and remind about tasks
- 🧩 **Extensions** - Extend functionality with plugins
- 🎨 **Themes** - Customize the look and feel

> **Note**: This is the bootstrap version (0.5.0). Core AI features are not yet implemented.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/stina.git
cd stina

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### Development

```bash
# Start API server and Web UI
pnpm dev:api   # API at http://localhost:3001
pnpm dev:web   # Web at http://localhost:3002

# Or run CLI
pnpm dev:tui hello --name World
```

### Available Scripts

| Script              | Description                      |
| ------------------- | -------------------------------- |
| `pnpm dev:api`      | Start API server with hot reload |
| `pnpm dev:web`      | Start Web UI with Vite           |
| `pnpm dev:electron` | Start Electron app               |
| `pnpm dev:tui`      | Run CLI commands                 |
| `pnpm build`        | Build all packages               |
| `pnpm test`         | Run tests                        |
| `pnpm lint`         | Run ESLint                       |
| `pnpm typecheck`    | Run TypeScript type checking     |

## Project Structure

```
stina/
├── apps/
│   ├── api/          # Fastify REST API server
│   ├── electron/     # Electron desktop app
│   ├── tui/          # Command-line interface
│   └── web/          # Vue.js web application
├── packages/
│   ├── adapters-node/  # Node.js specific implementations
│   ├── core/           # Platform-neutral business logic
│   ├── shared/         # Shared types and interfaces
│   └── ui-vue/         # Shared Vue components
└── docs/               # Documentation
```

## Architecture

Stina follows a clean architecture with clear separation:

- **Core** (`packages/core`): Platform-neutral business logic, no Node/browser imports
- **Adapters** (`packages/adapters-node`): Node.js specific implementations (DB, filesystem)
- **UI** (`packages/ui-vue`): Shared Vue components for Web and Electron
- **Apps**: Thin wrappers that wire everything together

See [docs/architecture.md](docs/architecture.md) for details.

## API Endpoints

| Endpoint            | Description            |
| ------------------- | ---------------------- |
| `GET /health`       | Health check           |
| `GET /hello?name=X` | Get a greeting         |
| `GET /themes`       | List available themes  |
| `GET /themes/:id`   | Get theme tokens       |
| `GET /extensions`   | List loaded extensions |

## CLI Commands

```bash
# Get a greeting
pnpm dev:tui hello
pnpm dev:tui hello --name Stina

# List themes
pnpm dev:tui theme --list
```

## Configuration

Stina stores data in OS-specific locations:

| OS      | Path                                   |
| ------- | -------------------------------------- |
| macOS   | `~/Library/Application Support/Stina/` |
| Linux   | `~/.local/share/Stina/`                |
| Windows | `%APPDATA%/Stina/`                     |

### Environment Variables

| Variable          | Default      | Description                           |
| ----------------- | ------------ | ------------------------------------- |
| `PORT`            | `3001`       | API server port                       |
| `DB_PATH`         | (OS default) | SQLite database path                  |
| `EXTENSIONS_PATH` | (OS default) | Extensions directory                  |
| `LOG_LEVEL`       | `info`       | Logging level (debug/info/warn/error) |

## Extensions

Extensions can add themes, commands, and more. See [docs/extensions.md](docs/extensions.md).

### Creating a Theme

Create a folder with `manifest.json`:

```json
{
  "id": "myname.my-theme",
  "version": "1.0.0",
  "name": "My Theme",
  "type": "theme",
  "engines": { "app": ">=0.5.0" },
  "contributes": {
    "themes": [
      {
        "id": "my-theme",
        "label": "My Theme",
        "tokens": {
          "background": "#1a1a2e",
          "foreground": "#eaeaea",
          "primary": "#6366f1",
          "primaryText": "#ffffff",
          "muted": "#2d2d44",
          "mutedText": "#9ca3af",
          "border": "#3d3d5c",
          "danger": "#ef4444",
          "success": "#22c55e",
          "warning": "#f59e0b"
        }
      }
    ]
  }
}
```

## Documentation

- [Architecture](docs/architecture.md)
- [Extensions](docs/extensions.md)
- [Themes](docs/themes.md)
- [Database](docs/database.md)
- [Configuration](docs/configuration.md)
- [Error Handling](docs/error-handling.md)
- [Technical Decisions](docs/decisions.md)

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Monorepo**: pnpm workspaces
- **API**: Fastify
- **Database**: SQLite (better-sqlite3 + Drizzle ORM)
- **Web UI**: Vue 3 + Vite
- **Desktop**: Electron
- **CLI**: Commander
- **Testing**: Vitest
- **Linting**: ESLint + Prettier

## License

MIT
