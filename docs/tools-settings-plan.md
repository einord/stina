# Tools Settings Plan

## Goals
- Show a Tools menu for installed + enabled tool extensions only.
- Provide list/search/create/edit/delete UIs for tool-backed registries (people first).
- Keep ownership boundaries: shared schema in packages, API/IPC in apps, UI in ui-vue.
- Reuse Settings view structure and existing components.
- Make it TUI-friendly later (clear schema + thin UI layer).

## Non-goals (now)
- Implement TUI rendering.
- Custom UI per extension (no custom Vue in extensions).
- Persisting tool list data as app settings.

## Design Overview
- Add a tool settings view schema in extension manifests.
- Use mapping to adapt tool outputs to generic list UI.
- Reuse SettingDefinition for edit/create fields only.
- Tool views appear only in Tools menu (not Extensions view).

## Schema (packages/extension-api)
Add a wrapper for tool view definitions. Reuse SettingDefinition for form fields.

Example shape:
- contributes.toolSettings: ToolSettingsViewDefinition[]
- ToolSettingsViewDefinition:
  - id, title, description
  - toolView.kind = "list"
  - toolView.listToolId (required)
  - toolView.getToolId (optional)
  - toolView.upsertToolId (optional)
  - toolView.deleteToolId (optional)
  - toolView.mapping:
    - itemsKey, countKey
    - idKey, labelKey
    - descriptionKey, secondaryKey
  - fields: SettingDefinition[] (used for create/edit modal)

Manifest validation updates live in:
- packages/extension-host/src/ManifestValidator.ts

## Node Runtime (adapters-node)
Create a shared helper to avoid duplicated setup:
- Load only enabled extensions via ExtensionInstaller.getEnabledExtensions().
- Register enabled manifests into ExtensionRegistry.
- Load enabled extensions into NodeExtensionHost.
- Expose helpers used by apps/api and apps/electron main.

## API (apps/api)
Add endpoints:
- GET /tools/settings
  - Returns enabled tool views + extension metadata needed for menu.
- POST /tools/execute
  - Body: { extensionId, toolId, params }
  - Calls extensionHost.executeTool(...)

Update ApiClient types and web HTTP client accordingly.

## IPC (apps/electron)
Mirror API via IPC:
- get-tools-settings
- execute-tool

Renderer client implements ApiClient.tools.* methods.

## UI (packages/ui-vue)
Add Settings-like layout:
- ToolsView.vue
- ToolsView.Menu.vue

List UI:
- Search input (query -> list tool params).
- EntityList for list rendering.
- Row click -> modal with edit fields + delete action.
- Create button -> modal with same fields.

Reuse components:
- EntityList, Modal, SimpleButton, TextInput, ExtensionSettingsForm.

## stina-ext-people
Add tool settings view in manifest:
- listToolId: people_list
- getToolId: people_get
- upsertToolId: people_upsert
- deleteToolId: people_delete
- mapping to list fields
- fields for create/edit

No tool output changes required if mapping is used.

## TUI Future
- Use same tool view schema.
- Provide a TUI renderer that consumes list + fields in a CLI-friendly way.

## Testing
- API route tests (list views, execute tool).
- UI: basic interaction smoke test (manual).
- Extension host: tool execute path already covered by integration flows.

## Risks
- Tool output shapes vary; mapping mitigates this.
- Enabled-only loading must be consistent across API and Electron.

