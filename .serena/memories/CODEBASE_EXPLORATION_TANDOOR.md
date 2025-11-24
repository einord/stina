# Stina Codebase Exploration - Tandoor Integration

## Project Overview

**Stina** is an experimental AI-assistant monorepo (Bun-based) with three client interfaces:
- **Desktop**: Vue 3 + Vite + Electron
- **TUI**: Blessed-based terminal UI
- **CLI**: Commander-based CLI

All clients share the same core API and persistent data layer.

## Tandoor Integration Architecture

### What is Tandoor?
Tandoor is a recipe management and meal planning integration that provides:
- Smart shopping intelligence with purchase history analysis
- Intelligent ingredient suggestions based on recent usage
- Food categorization (dairy, fresh, dry, frozen, unknown)
- Integration with external Tandoor MCP server (ChristopherJMiller/tandoor-mcp)

### Key Package Structure

```
packages/
├── tandoor/              # @stina/tandoor package
│   ├── src/
│   │   ├── types.ts      # All type definitions
│   │   ├── cook-history.ts  # analyzeCookHistory() function
│   │   ├── purchase-intelligence.ts  # Shopping logic
│   │   └── index.ts      # Main exports
│   ├── package.json      # Minimal config (no deps)
│   └── README.md         # API documentation
├── core/                 # @stina/core package
│   ├── src/
│   │   ├── chat.ts       # ChatManager class
│   │   ├── tools.ts      # Tool registration & MCP integration
│   │   └── tools/
│   │       ├── definitions/tandoor.ts  # Tool handlers
│   │       ├── definitions/todos.ts    # Example tool pattern
│   │       ├── infrastructure/base.ts  # ToolDefinition types
│   │       └── infrastructure/registry.ts  # createBuiltinTools()
├── store/                # @stina/store package
│   ├── src/
│   │   ├── toolkit.ts    # registerToolSchema(), getDatabase()
│   │   ├── todos.ts      # Example tool backend
│   │   └── tandoor.ts    # Tandoor persistence
└── mcp/                  # @stina/mcp package
    └── src/
        ├── client.ts     # MCP client implementation
        └── stdio-client.ts  # Stdio transport
```

## How Tools Are Registered in Stina

### Tool Definition Pattern (3 files)

1. **Tool Handler** (`packages/core/src/tools/definitions/tandoor.ts`):
```typescript
async function handleGetTodaysMeal(args: unknown) { ... }
const tandoorTools: ToolDefinition[] = [
  {
    spec: {
      name: 'get_todays_meal',
      description: 'Get today\'s planned meals with recipe details',
      parameters: { ... }
    },
    handler: handleGetTodaysMeal
  },
  // ... more tools
];
export { tandoorTools };
```

2. **Backend Logic** (`packages/store/src/tandoor.ts`):
   - Persist data using `registerToolSchema()` 
   - Database tables created on first initialization
   - Functions that handlers call (e.g., `getTandoorRecipes()`)

3. **Tool Integration** (`packages/core/src/tools.ts`):
```typescript
import { tandoorTools } from './tools/definitions/tandoor.js';

const toolDefinitions: ToolDefinition[] = [
  ...createBuiltinTools(getBuiltinCatalog, builtinHandlerMap),
  ...todoTools,
  ...memoryTools,
  ...profileTools,
  ...tandoorTools,  // <-- Added here
];
```

### Tool Spec Structure

```typescript
type ToolDefinition = {
  spec: {
    name: string;           // kebab-case identifier
    description: string;    // What model sees
    parameters: JsonSchema; // OpenAI-compatible JSON schema
  };
  handler: (args: unknown) => Promise<unknown>;
};
```

### Provider-Agnostic Tool Format

Tools are converted to provider-specific formats:
- **OpenAI**: `{ type: 'function', function: { name, description, parameters } }`
- **Anthropic**: `{ name, description, input_schema: parameters }`
- **Gemini**: Custom recursive schema conversion

## MCP Tool Integration

MCP (Model Context Protocol) tools are loaded dynamically:

1. **MCP Server Config** (stored in `settings.enc`):
   - Server URL/stdio path
   - OAuth configuration (optional PKCE flow)
   - Token storage (encrypted in settings.enc)

2. **Tool Loading** (`packages/core/src/tools.ts`):
```typescript
export async function refreshMCPToolCache(): Promise<void> {
  // 1. List all configured MCP servers
  // 2. Call each server's list_tools endpoint
  // 3. Decorate tool specs with server name
  // 4. Create handler proxy for mcp_call routing
  // 5. Update combinedCatalog
}
```

3. **Tool Invocation**:
   - Model calls `mcp_call` with server and tool name
   - ChatManager routes to `callMCPTool(serverName, toolName, args)`
   - MCP client (ws or stdio) executes on server

## Tandoor Tools (11 tools)

From `packages/core/src/tools/definitions/tandoor.ts`:

1. `get_todays_meal` - Today's recipes
2. `get_weekly_menu` - Week's meal plan
3. `search_recipes` - Find recipes by keywords
4. `get_recipe` - Full recipe details
5. `import_recipe` - Add recipe to Tandoor
6. `get_shopping_list` - Current shopping items
7. `add_to_shopping_list` - Add ingredients
8. `smart_shopping_list` - AI-powered list with skips
9. `suggest_skip` - Should-skip decision
10. `get_todays_meal` - Duplicate of #1
11. `get_weekly_menu` - Duplicate of #2

Helper functions:
- `addDays()`, `getWeekStart()` - Date math
- `getString()`, `toRecord()`, `toErrorMessage()` - Conversion utilities

## ChatManager Tool Management

**File**: `packages/core/src/chat.ts` and `packages/core/src/tools.ts`

### Tool Initialization Flow
1. Define tool specs + handlers in `ToolDefinition[]`
2. Create tool catalog: `BaseToolSpec[]`
3. Create handler map: `Map<toolName, ToolHandler>`
4. Call `createToolSpecs(toolDefinitions)` → provider format
5. Call `createToolSystemPrompt(toolDefinitions)` → instruction text
6. Send to model with prompt

### Tool Invocation Flow
1. Model returns tool_use/tool_call in response
2. ChatManager parses tool name + arguments
3. Looks up handler in `toolHandlers.get(name)`
4. Awaits `handler(args)` → JSON result
5. Sends result back to model in next turn

### API
- `listTools(filter?)` - Get tool specs as catalog
- `callTool(name, args)` - Execute any registered tool
- `sendMessage(userMessage, toolResults?)` - Full chat turn

## Database Persistence (Better-SQLite3)

**Toolkit Pattern** (`packages/store/src/toolkit.ts`):

```typescript
export function registerToolSchema(name: string, init: (db) => void) {
  // Ensures table creation happens exactly once per process
  // init() runs arbitrary SQL (CREATE TABLE, CREATE INDEX, etc.)
}

export function withDatabase<T>(fn: (db) => T): T {
  // Helper to get shared DB instance and run synchronous work
}
```

**Example** (`packages/store/src/todos.ts`):
```typescript
registerToolSchema('store.todos', (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ...
    );
    CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
  `);
});
```

All tools share `/Users/[user]/.stina/stina.db` with WAL mode enabled.

## Tool Handler Pattern

All handlers follow this structure:

```typescript
async function handleXyz(args: unknown) {
  const payload = toRecord(args);  // Type guard + casting
  
  try {
    // Extract parameters
    const input = typeof payload.x === 'string' ? payload.x : '';
    
    // Call backend logic
    const result = await someBackendFunction(input);
    
    // Return success
    return { ok: true, message: '...', result };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}
```

Response format: always `{ ok: boolean, ... }` to signal success/failure.

## Existing Tool Examples

### Todos Tool
- **Files**: 
  - Handler: `packages/core/src/tools/definitions/todos.ts` (235 lines)
  - Backend: `packages/store/src/todos.ts` (180+ lines)
  - Types: `packages/store/src/types/todo.ts`
- **Tools**: todo_list, todo_add, todo_update, todo_comment
- **Pattern**: CRUD operations on SQLite table

### Memory Tool
- **Files**: 
  - Handler: `packages/core/src/tools/definitions/memories.ts`
  - Backend: `packages/store/src/memories.ts`
- **Tools**: memory_read, memory_write, memory_list, memory_delete
- **Pattern**: File-based persistence in ~/.stina/memories/

### Profile Tool
- **Files**:
  - Handler: `packages/core/src/tools/definitions/profile.ts`
  - Backend: `packages/settings` (provider configuration)
- **Tools**: get_profile, set_profile
- **Pattern**: User metadata and preferences

## Configuration Management

**Settings Package** (`packages/settings`):
- Provider configurations (API keys, models)
- MCP server configurations
- Encrypted storage (AES-256-GCM) in `~/.stina/settings.enc`
- OS Keychain integration via `keytar`

**Exports**:
```typescript
export { 
  setActiveProvider, 
  updateProvider,
  listMCPServers,
  upsertMCPServer,
  setDefaultMCPServer
}
```

## Testing Infrastructure

**Status**: Currently no project-level tests found
- Packages have `tsconfig.json` but no test files in `/packages/*/src/`
- Bun test runner available but not configured
- Linting configured (ESLint + Prettier)
- Type checking via TypeScript

**Test Commands** (none yet):
```bash
bun test                # Would run if tests exist
bun run typecheck      # Per-package TypeScript check
```

## MCP Tools in Stina

**Package**: `packages/mcp/src/`

1. **client.ts**: Generic MCP client (ws transport)
2. **stdio-client.ts**: Stdio transport for local servers
3. **index.ts**: Public API `callMCPTool()`, `listMCPTools()`

**Built-in MCP Tools** (created in `createBuiltinTools()`):
- `list_tools` - Describe available tools
- `mcp_call` - Route to local tool handlers
- `console_log` - Disabled by default (model overuses)

## Build & Development

**Monorepo**: Bun workspaces
```bash
bun install              # Install all packages
bun run dev:desktop      # Vite dev server
bun run dev:electron     # Electron main process
bun run dev:all          # Both in parallel
bun run lint && lint:fix # ESLint
bun run format           # Prettier
```

**Package Exports** (via TypeScript aliases):
```json
{
  "@stina/core": "workspace:*",
  "@stina/tandoor": "workspace:*",
  "@stina/store": "workspace:*",
  "@stina/mcp": "workspace:*",
  "@stina/settings": "workspace:*",
  "@stina/crypto": "workspace:*",
  "@stina/i18n": "workspace:*"
}
```

All paths resolve via `tsconfig.json` paths.
