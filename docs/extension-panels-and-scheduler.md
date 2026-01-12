# Extension Panels + Scheduler Proposal

This document proposes a safe, declarative UI system for extension-driven right panels, a shared scheduler service, and a concrete plan for the `stina-ext-work` extension.

## Goals

- Allow extensions to render rich right-panel UI without executing UI code.
- Keep the sandbox model intact (workers only, no DOM access).
- Enable live updates via events (API SSE + Electron IPC).
- Provide a shared scheduler service across API/Electron/TUI (no duplicated logic).
- Support `stina-ext-work` requirements (projects, todos, reminders, panel UI).
- Keep future TUI rendering possible from the same DSL.

## Non-goals

- Running extension-authored Vue/HTML in iframes.
- App-specific, hardcoded UI for any single extension.

---

## 1) Right Panel: Declarative UI DSL

### 1.1 Manifest contributions

Add a new manifest contribution: `contributes.panels`.

```json
{
  "contributes": {
    "panels": [
      {
        "id": "work.todos",
        "title": "Work",
        "icon": "check-list",
        "view": { "kind": "groupedList", "...": "..." }
      }
    ]
  },
  "permissions": ["panels.register", "tools.register", "events.emit"]
}
```

### 1.2 Panel view DSL (minimal viable set)

The DSL is a safe JSON schema. Rendering is done only by `ui-vue` components.

**Core view types**

- `groupedList` (main use case)
- `list`
- `section`
- `stack` (vertical/horizontal)
- `text`
- `icon`
- `badge`
- `button`
- `divider`
- `form` (inline)
- `modal` (edit dialog)
- `accordion` (collapsible items)

**Data sources**

Each view can bind to one or more **data sources** that call tools:

```ts
interface PanelDataSource {
  id: string
  toolId: string
  params?: Record<string, unknown>
  refreshOn?: string[] // event names
  transform?: DataTransform
}
```

**Data transforms**

```ts
type DataTransform =
  | { kind: 'sort'; by: string; order?: 'asc' | 'desc' }
  | { kind: 'groupBy'; by: string; missingGroup?: { id: string; label: string } }
  | { kind: 'map'; fields: Record<string, string> }
```

### 1.3 Grouped list example (todos)

```json
{
  "kind": "groupedList",
  "data": [
    {
      "id": "projects",
      "toolId": "project.list",
      "refreshOn": ["work.project.changed"]
    },
    {
      "id": "todos",
      "toolId": "todo.list",
      "refreshOn": ["work.todo.changed"],
      "transform": { "kind": "sort", "by": "dueAt", "order": "asc" }
    },
    {
      "id": "panelState",
      "toolId": "panel.state.get",
      "params": { "panelId": "work.todos" }
    }
  ],
  "groups": {
    "source": "projects",
    "idKey": "id",
    "labelKey": "name",
    "sortBy": {
      "type": "earliestItem",
      "itemSource": "todos",
      "itemGroupKey": "projectId"
    },
    "missingGroup": { "id": "none", "label": "No project" }
  },
  "items": {
    "source": "todos",
    "groupKey": "projectId"
  },
  "collapsed": {
    "source": "panelState",
    "collapsedIdsKey": "collapsedGroupIds",
    "onToggle": { "toolId": "panel.state.set" }
  },
  "itemSummary": {
    "layout": "row",
    "icon": { "from": "item.icon" },
    "title": { "from": "item.title" },
    "meta": [{ "from": "item.displayDate" }, { "from": "item.displayTime" }],
    "badge": { "icon": "comment-01", "from": "item.commentCount" }
  },
  "itemDetail": {
    "layout": "stack",
    "sections": [
      { "kind": "text", "from": "item.description" },
      {
        "kind": "list",
        "source": "item.subtasks",
        "item": {
          "kind": "row",
          "checkbox": { "from": "subtask.completedAt", "toolId": "todo.subtask.complete" },
          "text": { "from": "subtask.text" },
          "delete": { "toolId": "todo.subtask.delete" }
        },
        "emptyText": "No subtasks"
      },
      {
        "kind": "list",
        "source": "item.comments",
        "item": {
          "kind": "stack",
          "text": { "from": "comment.text" },
          "meta": { "from": "comment.createdAt" }
        }
      },
      {
        "kind": "form",
        "title": "Add comment",
        "fields": [{ "id": "text", "type": "string", "title": "Comment" }],
        "submitToolId": "todo.comment.add"
      },
      {
        "kind": "button",
        "label": "Edit",
        "action": { "type": "openModal", "modalId": "todo.edit" }
      }
    ]
  },
  "modals": [
    {
      "id": "todo.edit",
      "title": "Edit todo",
      "getToolId": "todo.get",
      "upsertToolId": "todo.update",
      "fields": ["...SettingDefinition[]"]
    }
  ]
}
```

### 1.4 Binding rules

- `from: "item.field"` means the current list item.
- `from: "source.field"` means a named data source.
- For actions, UI passes the current item ID by default; additional params can be mapped.

---

## 2) Live Updates (Events)

### 2.1 Extension API

Add a safe event emitter to the worker context:

```ts
interface EventsAPI {
  emit(name: string, payload?: Record<string, unknown>): void
}
```

Permission: `events.emit`

### 2.2 Host + UI delivery

- **API**: `GET /extensions/events` as SSE stream.
- **Electron**: IPC channel `extensions:events` (renderer subscription).
- UI data sources re-run when `refreshOn` matches incoming events.

### 2.3 Naming conventions

Use namespaced event names:

- `work.todo.changed`
- `work.project.changed`
- `work.panel.state.changed`
- `work.settings.changed`

---

## 3) Scheduler Service (shared across apps)

### 3.1 Why not in core

Core is pure TS and should not own I/O or timers. We keep core types and logic pure, and implement the engine in a Node-only package that all Node apps reuse.

### 3.2 New package: `packages/scheduler`

**Responsibilities**

- Persist scheduled jobs in DB.
- Calculate next trigger (cron/at/interval).
- Trigger jobs even after downtime (misfire handling).
- Send events to extension workers.

**DB schema (suggested)**

```
scheduler_jobs
- id
- extension_id
- job_id
- schedule_type   // "at" | "cron" | "interval"
- schedule_value  // ISO | cron string | ms
- payload_json
- timezone
- last_run_at
- next_run_at
- misfire_policy  // "run_once" | "skip"
- enabled
```

### 3.3 Scheduler API (extension side)

```ts
interface SchedulerAPI {
  schedule(job: {
    id: string
    schedule:
      | { type: 'at'; at: string }
      | { type: 'cron'; cron: string; timezone?: string }
      | { type: 'interval'; everyMs: number }
    payload?: Record<string, unknown>
    misfire?: 'run_once' | 'skip'
  }): Promise<void>

  cancel(jobId: string): Promise<void>
}
```

Permission: `scheduler.register`

### 3.4 Worker callback

Host sends `scheduler.fire` messages to the worker; the extension registers a handler:

```ts
context.scheduler?.onFire((job) => { ... })
```

`job` should include timing metadata so extensions can localize delayed reminders:

```ts
interface SchedulerFirePayload {
  id: string
  payload?: Record<string, unknown>
  scheduledFor: string // ISO 8601
  firedAt: string      // ISO 8601
  delayMs: number
}
```

### 3.5 Misfire handling

On startup:

- If `next_run_at <= now`, trigger immediately.
- For recurring jobs, compute next run from last run time.
- For one-shot jobs, mark as completed after firing once.

---

## 4) Chat instruction injection

### 4.1 Extension API

Add a minimal `ChatAPI`:

```ts
interface ChatAPI {
  appendInstruction(message: {
    text: string
    conversationId?: string // optional
  }): Promise<void>
}
```

Permission: `chat.message.write`

### 4.2 Behavior

- If `conversationId` is missing, host resolves **latest active conversation**.
- Insert a `MessageType.INSTRUCTION` message.
- The extension should **localize** the instruction text before sending.

### 4.3 User locale sourcing (proposal)

Add a minimal `UserAPI` to `ExtensionContext`:

```ts
interface UserAPI {
  getProfile(): Promise<{
    name?: string
    locale?: string // e.g. "sv-SE"
    timeZone?: string // optional if needed later
  }>
}
```

Permission: `user.profile.read` (reused).

**Fallback logic (extension side):**

1. Try exact locale match (`sv-SE`).
2. Try language fallback (`sv`).
3. Use default template (e.g. `en` or a manifest default).
4. If locale is missing, skip to step 3.

---

## 5) stina-ext-work: data + tools

### 5.1 Data model (tables)

```
projects
- id (pk)
- name
- description
- created_at
- updated_at

todos
- id (pk)
- project_id (nullable)
- title
- description
- icon
- status            // "not_started" | "in_progress" | "done" | "cancelled"
- due_at            // ISO 8601 with timezone offset, e.g. 2025-12-17T14:03:12+01:00
- all_day           // boolean
- reminder_minutes  // integer | null
- created_at
- updated_at

todo_subtasks
- id (pk)
- todo_id
- text
- completed_at      // nullable ISO

todo_comments
- id (pk)
- todo_id
- created_at
- text

panel_state
- panel_id
- group_id
- collapsed         // boolean
```

### 5.2 Extension settings

Manifest settings (global):

- `defaultReminderMinutes` (select)
- `allDayReminderTime` (time-of-day string, e.g. `09:00`)
- `reminderTemplates` (optional map keyed by locale, e.g. `{ sv: "...", en: "..." }`)

### 5.3 Tools

Projects:

- `project.list`
- `project.create`
- `project.update`
- `project.delete`

Todos:

- `todo.list` (returns projectId, dueAt, commentCount, subtaskCount)
- `todo.get`
- `todo.create`
- `todo.update`
- `todo.delete`

Subtasks:

- `todo.subtask.add`
- `todo.subtask.complete`
- `todo.subtask.delete`

Comments:

- `todo.comment.add`
- `todo.comment.delete`

Panel state:

- `panel.state.get`
- `panel.state.set`

### 5.4 Reminder scheduling

When a todo is created or updated:

1. Compute `triggerAt`:
   - If `allDay = true`, use `allDayReminderTime` with the date from `due_at`.
     - When `allDay = true`, do not allow or apply any reminder offset; the reminder always fires at the configured all-day time (if set).
     - The UI should hide/disable reminder offset inputs when all-day is selected.
   - Else use `due_at` directly.
   - Apply `reminder_minutes` offset (default from settings if null).
2. `scheduler.schedule({ id: "todo.reminder:{todoId}", schedule: { type: "at", at: triggerAt }, payload: { todoId } })`

On fire:

- Load todo + user profile name + locale (if permission).
- Pick localized template:
  - Prefer exact locale (e.g. `sv-SE`), else fallback to language (`sv`), else default.
- If `delayMs > 0`, use a delayed variant or include the delay duration in the message.
- Build instruction text (example placeholders):
  ```
  [Auto TODO reminder] The time for todo (id: {{id}}) is now.
  {{#if delay}}This reminder is delayed by {{delayMinutes}} minutes.{{/if}}
  Tell {{userName}} that '{{title}}' is due now and adapt the tone to the task.
  {{todoJson}}
  ```
- `chat.appendInstruction({ text })`

### 5.5 Events

Emit events on mutations:

- `work.todo.changed`
- `work.project.changed`
- `work.panel.state.changed`
- `work.settings.changed`

---

## 6) UI: right panel behavior (todos)

### 6.1 Grouping and sorting

- Items sorted by `dueAt` ascending.
- Groups sorted by earliest `dueAt` among items (ignoring done/cancelled if desired).
- "No project" group for `projectId = null`.

### 6.2 Item summary

Show:

- Icon
- Title
- Date + Time (derived from `dueAt`, or "All day")
- Comment count badge

### 6.3 Item detail

When expanded:

- Description
- Subtasks (checkbox + delete)
- Comments (chronological)
- Add comment form
- Add subtask form
- Edit button opens modal

### 6.4 Edit modal (generic)

Use `SettingDefinition[]` and a shared `ExtensionSettingsForm` renderer.

---

## 7) Required API additions (summary)

**extension-api**

- `contributes.panels`
- `PanelView` DSL types
- `EventsAPI` + permission `events.emit`
- `SchedulerAPI` + permission `scheduler.register`
- `ChatAPI` + permission `chat.message.write`
- `UserAPI.getProfile()` (locale + name) under `user.profile.read`

**extension-host**

- Panel registry: `getPanelViews()`
- Event bridge to API/Electron
- Scheduler integration with worker messages
- Chat instruction insertion endpoint

**ui-vue**

- Right panel renderer for panel DSL
- Event subscriber (SSE/IPC)
- Reusable modal/form renderer

**apps/api**

- `GET /extensions/panels`
- `GET /extensions/events` (SSE)

**apps/electron**

- IPC for panel definitions + events

---

## 8) Suggested implementation order

1. Add panel DSL types + manifest validation + host registry.
2. Implement panel renderer in `ui-vue`.
3. Add events emitter + SSE/IPC subscriber.
4. Add scheduler package + host integration.
5. Build `stina-ext-work` extension (DB + tools + panel definition).
6. Wire reminder -> chat instruction flow.

---

## Open questions (deferred)

- Should completed todos be hidden by default or shown at the bottom? - Shown in a seperate group with the title "Closed today" until next day.
- Should panel state be per-user or per-device (depends on storage layer)? - User level
