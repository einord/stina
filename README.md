# Stina

Stina is a local-first AI assistant for your workday. It runs on your machine, keeps your data on your machine, and aims to help with focus, tasks, reminders, and daily planning.

> **Note:** This is still a work in progress and Core AI features are still being built and some functionality is placeholder or planned.

## What Stina is

- A personal assistant app that runs locally (and uses any AI provider that you choose).
- Runs either as a desktop app, API + web or TUI application that talks to the provided AI service (i.e. Ollama, OpenAI, Anthropic, Gemini, etc).
- An extensible system for themes, integrations and customization.

## What you can expect

Features include:

- Chat-style assistance - Just write things you want the AI to remember or remind you of and Stina will notify you when needed.
- Task and reminder management
- Calendar and e-mail integration
- Extensions and themes

## Install and run

For the easiest install and non-technical instructions, see https://stina.app.

There are also downloadable standalone applications available in the releases (https://github.com/einord/stina/releases/latest).

If you want to self-host locally, Docker Compose is the simplest option.

### Docker Compose (API + Web UI)

Create a `docker-compose.yml` file:

```yaml
services:
  api:
    container_name: stina-api
    image: ghcr.io/einord/stina-api:${STINA_VERSION:-latest}
    restart: unless-stopped
    ports:
      - '3001:3001'
    environment:
      NODE_ENV: production
      DB_PATH: /data/data.db
      EXTENSIONS_PATH: /data/extensions
    volumes:
      - ${STINA_DATA_PATH:-./data}:/data

  web:
    container_name: stina-web
    image: ghcr.io/einord/stina-web:${STINA_VERSION:-latest}
    restart: unless-stopped
    ports:
      - '3002:3002'
    depends_on:
      - api
```

Run it:

```bash
docker compose up -d
```

Open the app in your browser:

- Web UI: http://localhost:3002
- API: http://localhost:3001

#### Data storage

All your data (database and extensions) is stored in the `./data` folder next to your `docker-compose.yml` file. This ensures your data persists across container updates.

To use a different location, set the `STINA_DATA_PATH` environment variable:

```bash
STINA_DATA_PATH=/path/to/your/data docker compose up -d
```

Or create a `.env` file next to your `docker-compose.yml`:

```
STINA_DATA_PATH=/path/to/your/data
```

#### Updating Stina

To update to the latest version:

```bash
docker compose pull
docker compose down
docker compose up -d
```

Your data in `./data` will be preserved.

For advanced configuration, see `docs/configuration.md`.

## For contributors

If you want to develop Stina, start here: `docs/introduction.md`.
