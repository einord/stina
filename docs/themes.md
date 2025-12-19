# Themes

Stina supports dynamic theming through theme tokens that are applied as CSS custom properties.

## Theme Tokens

Every theme must define these tokens:

| Token         | Description           |
| ------------- | --------------------- |
| `background`  | Main background color |
| `foreground`  | Main text color       |
| `primary`     | Primary action color  |
| `primaryText` | Text color on primary |
| `muted`       | Secondary background  |
| `mutedText`   | Secondary text color  |
| `border`      | Border color          |
| `danger`      | Error/danger color    |
| `success`     | Success color         |
| `warning`     | Warning color         |

Optional tokens:
| Token | Description |
|-------|-------------|
| `radius` | Border radius (e.g., "0.5rem") |
| `spacing` | Base spacing unit |

## Built-in Themes

Stina includes two built-in themes:

### Dark (default)

```json
{
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
```

### Light

```json
{
  "background": "#ffffff",
  "foreground": "#1a1a2e",
  "primary": "#6366f1",
  "primaryText": "#ffffff",
  "muted": "#f3f4f6",
  "mutedText": "#6b7280",
  "border": "#e5e7eb",
  "danger": "#dc2626",
  "success": "#16a34a",
  "warning": "#d97706"
}
```

## Web Implementation

Themes are applied using CSS custom properties:

```typescript
import { applyTheme } from '@stina/ui-vue'

// Apply a theme
applyTheme({
  background: '#1a1a2e',
  foreground: '#eaeaea',
  // ...
})
```

This sets properties on `:root`:

```css
:root {
  --color-background: #1a1a2e;
  --color-foreground: #eaeaea;
  --color-primary: #6366f1;
  /* ... */
}
```

Use in CSS:

```css
.my-component {
  background: var(--color-background);
  color: var(--color-foreground);
  border: 1px solid var(--color-border);
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

The user's theme preference is stored in the encrypted config file (`config.enc`):

```json
{
  "app": {
    "theme": "dark"
  }
}
```

This syncs across all apps (Web, Electron, TUI).

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
