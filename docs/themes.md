# Themes

Stina supports dynamic theming through theme tokens that are applied as CSS custom properties.

## Theme Tokens

The single source of truth for tokens is `packages/core/src/themes/tokenSpec.ts`. Tokens are defined in a **hierarchical tree** and flattened automatically. CSS variable names are derived from the path:

- `main.windowBackground` → `--theme-main-window-background`
- `accent.primary` → `--theme-accent-primary`

Current tokens (dot-notation):

| Token                      | Description                             |
| -------------------------- | --------------------------------------- |
| `main.windowBackground`    | Main window background                  |
| `main.windowForeground`    | Primary text color                      |
| `accent.primary`           | Primary action color                    |
| `accent.primaryText`       | Text color on primary                   |
| `surface.muted`            | Secondary background                    |
| `surface.mutedText`        | Secondary text color                    |
| `surface.border`           | Border color                            |
| `state.danger`             | Error/danger color                      |
| `state.success`            | Success color                           |
| `state.warning`            | Warning color                           |
| `layout.radius`            | Border radius (e.g., `0.5rem`)          |
| `layout.spacing`           | Base spacing unit                       |
| `dev.appBackgroundTest`    | Dev/test background token placeholder   |

## Built-in Themes

Stina includes two built-in themes:

### Dark (default)

```json
{
  "main.windowBackground": "#1a1a2e",
  "main.windowForeground": "#eaeaea",
  "accent.primary": "#6366f1",
  "accent.primaryText": "#ffffff",
  "surface.muted": "#2d2d44",
  "surface.mutedText": "#9ca3af",
  "surface.border": "#3d3d5c",
  "state.danger": "#ef4444",
  "state.success": "#22c55e",
  "state.warning": "#f59e0b"
}
```

### Light

```json
{
  "main.windowBackground": "#ffffff",
  "main.windowForeground": "#1a1a2e",
  "accent.primary": "#6366f1",
  "accent.primaryText": "#ffffff",
  "surface.muted": "#f3f4f6",
  "surface.mutedText": "#6b7280",
  "surface.border": "#e5e7eb",
  "state.danger": "#dc2626",
  "state.success": "#16a34a",
  "state.warning": "#d97706"
}
```

## Web Implementation

Themes are applied using CSS custom properties:

```typescript
import { applyTheme } from '@stina/ui-vue'

// Apply a theme
applyTheme({
  'main.windowBackground': '#1a1a2e',
  'main.windowForeground': '#eaeaea',
  // ...
})
```

This sets properties on `:root`:

```css
:root {
  --theme-main-window-background: #1a1a2e;
  --theme-main-window-foreground: #eaeaea;
  --theme-accent-primary: #6366f1;
  /* ... */
}
```

Use in CSS:

```css
.my-component {
  background: var(--theme-main-window-background);
  color: var(--theme-main-window-foreground);
  border: 1px solid var(--theme-surface-border);
}
```

## TUI Implementation (Future)

For terminal UI, theme tokens can be mapped to ANSI colors:

```typescript
import chalk from 'chalk'

const ansiColors = {
  primary: chalk.hex(tokens.primary),
  danger: chalk.hex(tokens.danger),
  success: chalk.hex(tokens.success),
  // ...
}

console.log(ansiColors.primary('Primary colored text'))
```

Note: Terminal color support varies. Consider providing fallbacks for terminals with limited color support.

## Theme Persistence

The active theme is stored in `localStorage` by the shared `createThemeController` helper (`@stina/ui-vue`). Each renderer (Web/Electron) reads/writes the same storage key (`stina-theme` by default).

## Creating a Theme Extension

1. Create a folder: `my-theme/`
2. Add `manifest.json`:

```json
{
  "id": "myname.my-theme",
  "version": "1.0.0",
  "name": "My Custom Theme",
  "type": "theme",
  "engines": { "app": ">=0.5.0" },
  "contributes": {
    "themes": [
      {
        "id": "my-theme",
        "label": "My Theme",
        "tokens": {
          "background": "#0d1117",
          "foreground": "#c9d1d9",
          "primary": "#58a6ff",
          "primaryText": "#ffffff",
          "muted": "#161b22",
          "mutedText": "#8b949e",
          "border": "#30363d",
          "danger": "#f85149",
          "success": "#3fb950",
          "warning": "#d29922"
        }
      }
    ]
  }
}
```

3. Place in extensions folder
4. Restart the app to load the theme

## Developer workflow (live updates)

- **Web**: Vite HMR watches `packages/core/src/themes/tokenSpec.ts` and re-applies the theme automatically when it changes.
- **Electron**: `pnpm dev:electron` runs three watchers (core → dist, tsup → dist/main+preload, nodemon → Electron). Changing `tokenSpec.ts` triggers a core build to `packages/core/dist`, tsup rebuilds main, nodemon restarts Electron, and the renderer re-applies the theme via `reloadThemes`.
