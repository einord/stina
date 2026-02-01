# Adding a Theme

Themes in Stina are implemented as extensions. This guide covers both built-in themes and external theme extensions.

## Theme Extension Structure

A theme extension provides color tokens that style the entire application. Each theme must define an `ExtensionManifest` with type `theme` and contribute one or more theme definitions.

## Option 1: Adding a Built-in Theme

Built-in themes are defined in `packages/adapters-node/src/extensions/builtins.ts`.

```typescript
import type { ExtensionManifest, ThemeTokens } from '@stina/core'
import { flattenThemeValues } from '@stina/core'

const myThemeTokens: Partial<ThemeTokens> = flattenThemeValues({
  general: {
    background: '#1a1a2e',
    color: '#eaeaea',
    colorPrimary: '#6366f1',
  },
  // Add more token overrides as needed
})

export const myThemeExtension: ExtensionManifest = {
  id: 'stina.theme-custom',
  version: '1.0.0',
  name: 'My Custom Theme',
  description: 'A custom theme for Stina',
  type: 'theme',
  engines: { app: '>=0.5.0' },
  contributes: {
    themes: [
      {
        id: 'custom',
        label: 'Custom',
        tokens: myThemeTokens,
      },
    ],
  },
}
```

Then add your extension to the `builtinExtensions` array in the same file.

## Option 2: Creating an External Extension

For distributable themes, create a `manifest.json` file:

```json
{
  "id": "my-org.theme-ocean",
  "version": "1.0.0",
  "name": "Ocean Theme",
  "description": "A calming ocean-inspired theme",
  "type": "theme",
  "engines": { "app": ">=0.5.0" },
  "contributes": {
    "themes": [
      {
        "id": "ocean",
        "label": "Ocean",
        "tokens": {
          "general.background": "#0a1628",
          "general.color": "#e0e7ff",
          "general.colorPrimary": "#38bdf8"
        }
      }
    ]
  }
}
```

## ThemeTokens Interface

The `ThemeTokens` interface defines all available styling tokens. Tokens use dot notation paths that map to CSS variables (e.g., `general.background` becomes `--theme-general-background`).

### Token Categories

| Category | Description |
|----------|-------------|
| `general.*` | Base colors: background, text, borders, primary accent |
| `main.*` | Main window and layout-specific styles |
| `main.components.*` | Navbar, chat area, and main content styling |
| `components.*` | UI components: buttons, cards, inputs, modals, etc. |

### Key Tokens Reference

```typescript
// General tokens
'general.background'          // App background
'general.color'               // Base text color
'general.colorPrimary'        // Primary accent color
'general.colorPrimaryContrast'// Text on primary backgrounds
'general.borderColor'         // Default border color

// Component tokens
'components.button.background'
'components.button.backgroundPrimary'
'components.card.background'
'components.modal.background'
'components.input.background'
```

## Full Example: Purple Theme

```typescript
import type { ExtensionManifest, ThemeTokens } from '@stina/core'
import { flattenThemeValues } from '@stina/core'

const purpleTokens: Partial<ThemeTokens> = flattenThemeValues({
  general: {
    background: 'hsl(270, 50%, 8%)',
    backgroundSecondary: 'hsl(270, 45%, 12%)',
    backgroundHover: 'hsl(270, 45%, 16%)',
    color: 'hsl(270, 20%, 85%)',
    colorMuted: 'hsl(270, 15%, 60%)',
    colorPrimary: 'hsl(280, 80%, 65%)',
    colorPrimaryContrast: '#ffffff',
    colorDanger: '#ef4444',
    borderColor: 'hsl(270, 30%, 25%)',
  },
  components: {
    button: {
      background: 'hsl(270, 40%, 15%)',
      backgroundHover: 'hsl(270, 40%, 20%)',
      backgroundPrimary: 'hsl(280, 80%, 65%)',
      colorPrimary: '#ffffff',
    },
    card: {
      background: 'hsl(270, 45%, 12%)',
    },
    modal: {
      background: 'hsl(270, 40%, 10%)',
      overlayBackground: 'rgba(0, 0, 0, 0.7)',
    },
  },
})

export const purpleThemeExtension: ExtensionManifest = {
  id: 'stina.theme-purple',
  version: '1.0.0',
  name: 'Purple Theme',
  description: 'A purple-tinted dark theme',
  type: 'theme',
  engines: { app: '>=0.5.0' },
  contributes: {
    themes: [
      {
        id: 'purple',
        label: 'Purple',
        tokens: purpleTokens,
      },
    ],
  },
}
```

Tokens you do not override will use their default values from the base theme specification.
