# Extension UI Components

This document describes the declarative component DSL used for extension panels and tool settings views. Extensions define their UI using a JSON-based schema that the host application interprets and renders securely.

## Overview

The component system enables extensions to create rich UI without executing arbitrary code in the browser. Extensions declare their UI structure in `manifest.json`, and the host renders it using pre-built Vue components. This approach:

- Keeps the sandbox model intact (workers only, no DOM access)
- Ensures consistent design across all extensions
- Enables live updates via events (SSE/IPC)
- Supports future TUI rendering from the same DSL

## Panel Views

Panels appear in the right sidebar and display extension-specific content. Define panels in `manifest.json` under `contributes.panels`.

```json
{
  "contributes": {
    "panels": [
      {
        "id": "work.todos",
        "title": "Work",
        "icon": "check-list",
        "view": {
          "kind": "component",
          "data": {
            "projects": {
              "action": "getProjectsWithTodos",
              "refreshOn": ["work.project.changed", "work.todo.changed"]
            }
          },
          "content": {
            "component": "VerticalStack",
            "gap": 1,
            "children": {
              "each": "$projects",
              "as": "project",
              "items": [
                {
                  "component": "Panel",
                  "title": "$project.name",
                  "icon": "folder-01",
                  "content": {
                    "component": "Label",
                    "text": "$project.description"
                  }
                }
              ]
            }
          }
        }
      }
    ]
  }
}
```

### Data Sources

Data sources fetch data via registered actions. Keys become scope variables prefixed with `$`.

| Property | Type | Description |
|----------|------|-------------|
| `action` | `string` | Action ID to call for fetching data |
| `params` | `object` | Parameters passed to the action |
| `refreshOn` | `string[]` | Event names that trigger a data refresh |

## Tool Settings Views

Tool settings views appear in the settings area and support CRUD operations for extension data.

### List View (`kind: "list"`)

```json
{
  "contributes": {
    "toolSettings": [
      {
        "id": "contacts",
        "title": "Contacts",
        "description": "Manage your contacts",
        "view": {
          "kind": "list",
          "listToolId": "contact.list",
          "getToolId": "contact.get",
          "upsertToolId": "contact.upsert",
          "deleteToolId": "contact.delete",
          "mapping": {
            "itemsKey": "contacts",
            "idKey": "id",
            "labelKey": "name",
            "descriptionKey": "email"
          }
        },
        "fields": [
          { "id": "name", "title": "Name", "type": "string" },
          { "id": "email", "title": "Email", "type": "string" }
        ]
      }
    ]
  }
}
```

### Component View (`kind: "component"`)

For custom layouts, use the component view which shares the same DSL as panels.

```json
{
  "view": {
    "kind": "component",
    "data": {
      "settings": { "action": "getSettings", "refreshOn": ["settings.changed"] }
    },
    "content": {
      "component": "VerticalStack",
      "children": [...]
    }
  }
}
```

## Available Components

### Layout Components

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `VerticalStack` | Stacks children vertically | `gap`, `children` |
| `HorizontalStack` | Stacks children horizontally | `gap`, `children` |
| `Grid` | Grid layout | `columns`, `gap`, `children` |
| `Panel` | Container with header and actions | `title`, `icon`, `actions`, `content` |
| `Collapsible` | Expandable section | `title`, `icon`, `defaultExpanded`, `content` |
| `Frame` | Styled container with optional collapsible header | `title`, `variant`, `collapsible`, `defaultExpanded`, `children` |
| `ConditionalGroup` | Renders children when condition is true | `condition`, `children` |

### Text Components

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Header` | Section heading | `level`, `title`, `description`, `icon` |
| `Label` | Single-line text | `text` |
| `Paragraph` | Multi-line text | `text` |
| `Markdown` | Rendered markdown content | `content` |

### Interactive Components

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Button` | Clickable button | `text`, `onClickAction` |
| `IconButton` | Icon-only button | `icon`, `tooltip`, `type`, `onClickAction` |
| `TextInput` | Text input field | `label`, `placeholder`, `value`, `onChangeAction` |
| `DateTimeInput` | Date/time picker | `label`, `value`, `onChangeAction` |
| `Select` | Dropdown selector | `label`, `options`, `selectedValue`, `onChangeAction` |
| `Toggle` | On/off switch | `label`, `checked`, `onChangeAction` |
| `Checkbox` | Checkbox with label | `label`, `checked`, `strikethrough`, `onChangeAction` |

### Visual Components

| Component | Description | Key Props |
|-----------|-------------|-----------|
| `Divider` | Horizontal line separator | (none) |
| `Icon` | Display an icon | `name`, `title` |
| `Pill` | Badge/tag element | `text`, `icon`, `variant` |
| `Modal` | Dialog overlay | `title`, `open`, `body`, `footer`, `onCloseAction` |

## Data Flow and Scope

### Scope Variables

Values prefixed with `$` are resolved from the current scope:

- `"$projects"` - Reference to a data source
- `"$project.name"` - Field from current iteration item
- `"$todo.subtasks"` - Nested field access

### Iterators

Use iterators to render lists of components:

```json
{
  "component": "VerticalStack",
  "children": {
    "each": "$todos",
    "as": "todo",
    "items": [
      { "component": "Label", "text": "$todo.title" }
    ]
  }
}
```

### Action Calls

Actions can be a simple string or an object with parameters:

```json
{
  "component": "IconButton",
  "icon": "delete-02",
  "tooltip": "Delete",
  "onClickAction": {
    "action": "deleteTodo",
    "params": { "todoId": "$todo.id" }
  }
}
```

### Refresh Events

Data sources re-fetch when events in `refreshOn` are emitted:

```ts
// In extension code
context.events.emit('work.todo.changed')
```

## Styling

Components support an optional `style` property for inline CSS. Styles are sanitized to prevent security risks.

```json
{
  "component": "HorizontalStack",
  "style": {
    "background-color": "#f5f5f5",
    "border-radius": "8px",
    "padding": "1rem"
  },
  "children": [...]
}
```

### Dynamic Style Values

Style values can reference scope variables:

```json
{
  "component": "Label",
  "text": "$todo.title",
  "style": {
    "color": "$todo.statusColor"
  }
}
```

### Allowed CSS Properties

| Category | Properties |
|----------|------------|
| Colors | `color`, `background-color`, `background`, `border-color` |
| Borders | `border`, `border-radius`, `border-width`, `border-style`, `border-*` |
| Spacing | `padding`, `margin` (all variants), `gap`, `row-gap`, `column-gap` |
| Typography | `font-size`, `font-weight`, `font-style`, `text-align`, `text-decoration`, `line-height` |
| Layout | `width`, `height`, `min-*`, `max-*`, `flex`, `flex-grow`, `flex-shrink`, `align-self` |
| Visual | `opacity`, `visibility`, `overflow`, `box-shadow`, `outline`, `cursor` |

### Blocked Properties (Security)

The following are blocked to prevent malicious extensions:

- **UI Spoofing**: `position`, `z-index`, `top`, `left`, `right`, `bottom`, `transform`
- **Clickjacking**: `pointer-events`
- **Content Injection**: `content`
- **Blocked Values**: `url()`, `expression()`, `javascript:`, `@import`

Blocked styles are logged to the console in development mode.

## Implementation Files

The component system is implemented in `packages/ui-vue`:

| File | Purpose |
|------|---------|
| `ExtensionComponent.vue` | Resolves props and renders the appropriate component |
| `ExtensionChildren.vue` | Handles static arrays and iterators for child rendering |
| `ExtensionScopeProvider.vue` | Provides and merges scope context for nested components |
| `useExtensionScope.ts` | Composable for scope injection, value resolution, and style sanitization |

Type definitions are in `packages/extension-api`:

| File | Purpose |
|------|---------|
| `types.components.ts` | Component prop interfaces and data source types |
| `types.contributions.ts` | Panel, tool settings, and view definitions |
