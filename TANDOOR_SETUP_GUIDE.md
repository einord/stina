# Tandoor MCP Server Setup Guide

## Quick Overview

The Tandoor integration has **two setup paths**:

1. **Full Setup** (with real Tandoor instance) - Complete integration with your Tandoor server
2. **Testing Mode** (without Tandoor) - Test the tool definitions without a running server

## Path 1: Full Setup (Production Use)

### Prerequisites

- **Tandoor Instance**: You need a running Tandoor Recipes server
  - Self-hosted: https://docs.tandoor.dev/install/docker/
  - Or use an existing instance

- **Rust**: Required to build the MCP server
  - Will be installed automatically by the setup script

### Step 1: Install & Build the MCP Server

Run the automated setup script:

```bash
./scripts/setup-tandoor-mcp.sh
```

This script will:
1. ✅ Install Rust (if not already installed)
2. ✅ Clone the tandoor-mcp repository to `~/.stina/mcp-servers/`
3. ✅ Build the server with `cargo build --release`

**Build time**: ~5-10 minutes (first time only)

### Step 2: Configure Tandoor Credentials

Set your Tandoor instance credentials:

```bash
export TANDOOR_BASE_URL="http://localhost:8080"
export TANDOOR_USERNAME="admin"
export TANDOOR_PASSWORD="your-password"
```

**Important**: Make these permanent by adding to your shell profile:

```bash
# Add to ~/.zshrc or ~/.bashrc
echo 'export TANDOOR_BASE_URL="http://localhost:8080"' >> ~/.zshrc
echo 'export TANDOOR_USERNAME="admin"' >> ~/.zshrc
echo 'export TANDOOR_PASSWORD="your-password"' >> ~/.zshrc

# Reload shell
source ~/.zshrc
```

### Step 3: Configure Stina

Run the configuration script:

```bash
bun scripts/configure-tandoor-mcp.ts
```

This adds the MCP server to `~/.stina/settings.enc`:

```json
{
  "name": "tandoor",
  "type": "stdio",
  "command": "/Users/you/.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp"
}
```

### Step 4: Restart Stina

```bash
# Stop current instance (Ctrl+C)
# Restart
bun run dev:all
```

### Step 5: Verify

Check the console for:
```
[tools] Loading tools from tandoor...
[tools] Loaded 9 tools from tandoor
```

Or ask Stina directly:
```
"Vilka Tandoor-verktyg finns?"
```

Expected response: List of 9 tools including `tandoor_get_todays_meal`, `tandoor_smart_shopping_list`, etc.

---

## Path 2: Testing Mode (No Tandoor Instance Required)

If you **don't have a Tandoor instance** but want to test the integration code, you can test without the MCP server.

### What You Can Test

✅ **Tool Definitions**: Verify all 9 tools are registered
✅ **Storage Layer**: Test database schema and caching functions
✅ **Intelligence Logic**: Test smart shopping algorithms
✅ **i18n**: Verify translations work

❌ **Can't Test**: Actual MCP communication (returns mock/error data)

### Quick Test Setup

1. **Check Tool Registration**

```typescript
// Test in Bun REPL
import { getToolCatalog } from '@stina/core/tools';

const catalog = getToolCatalog();
const tandoorTools = catalog.filter(t => t.name.startsWith('tandoor_'));

console.log(`Found ${tandoorTools.length} Tandoor tools`);
console.log(tandoorTools.map(t => t.name));
```

Expected output:
```
Found 9 Tandoor tools
[
  'tandoor_get_todays_meal',
  'tandoor_get_weekly_menu',
  'tandoor_smart_shopping_list',
  'tandoor_add_to_shopping_list',
  'tandoor_get_shopping_list',
  'tandoor_import_recipe',
  'tandoor_search_recipes',
  'tandoor_get_recipe',
  'tandoor_suggest_skip'
]
```

2. **Test Storage Layer**

```typescript
import {
  cacheRecipe,
  getCachedRecipe,
  logPurchase,
  getPurchaseHistory,
} from '@stina/store/tandoor';

// Cache a test recipe
cacheRecipe({
  tandoorId: 123,
  name: 'Test Recipe',
  ingredients: [{ food: 'Milk', amount: 1 }]
});

// Retrieve it
const recipe = getCachedRecipe(123);
console.log('Cached recipe:', recipe);

// Log a purchase
logPurchase({
  foodName: 'Milk',
  purchasedAt: Date.now()
});

// Get history
const history = getPurchaseHistory('Milk');
console.log('Purchase history:', history);
```

3. **Test Intelligence Logic**

```typescript
import {
  analyzeCookHistory,
  shouldSkipItem,
  categorizeFoodItem,
} from '@stina/tandoor';

// Create mock cook log
const mockCookLog = [
  {
    recipe: { id: 1, name: 'Pasta' },
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ingredients_used: [{ food: { name: 'Mjölk' } }]
  }
];

// Analyze
const suggestion = analyzeCookHistory(mockCookLog, { food_name: 'Mjölk' });
console.log('Suggestion:', suggestion);

// Should we skip?
const { skip, reason } = shouldSkipItem(suggestion, 'Mjölk');
console.log(`Skip: ${skip}, Reason: ${reason}`);

// Categorize
const category = categorizeFoodItem('Mjölk');
console.log('Category:', category); // 'dairy'
```

Expected output:
```
Suggestion: {
  lastUsedDaysAgo: 2,
  frequencyScore: 1,
  category: 'dairy'
}
Skip: true
Reason: Dairy product used 2 days ago (threshold: 7 days)
Category: dairy
```

---

## Troubleshooting

### Build Errors

**Problem**: `cargo build` fails

**Solutions**:
- Update Rust: `rustup update`
- Check error messages for missing dependencies
- macOS: Install Xcode Command Line Tools: `xcode-select --install`

### Environment Variables Not Found

**Problem**: "Missing required environment variables"

**Solutions**:
1. Verify they're set: `echo $TANDOOR_BASE_URL`
2. Make sure they're in your shell profile
3. Reload shell: `source ~/.zshrc`

### MCP Server Not Connecting

**Problem**: "Failed to load tools from tandoor"

**Solutions**:
1. Verify server binary exists:
   ```bash
   ls -lh ~/.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp
   ```
2. Test server directly:
   ```bash
   ~/.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp --help
   ```
3. Check Tandoor instance is reachable:
   ```bash
   curl $TANDOOR_BASE_URL/api/info/
   ```

### Tools Not Appearing in Stina

**Problem**: AI doesn't see Tandoor tools

**Solutions**:
1. Check tool registry:
   ```typescript
   import { getToolCatalog } from '@stina/core/tools';
   console.log(getToolCatalog().filter(t => t.name.includes('tandoor')));
   ```
2. Verify MCP cache was refreshed (check logs on startup)
3. Try manually refreshing:
   ```typescript
   import { refreshMCPToolCache } from '@stina/core/tools';
   await refreshMCPToolCache();
   ```

### Permission Errors from Tandoor

**Problem**: "Permission denied" or "No space configured"

**Solution**: Follow Tandoor setup instructions in the MCP server README:
1. Access Tandoor admin interface
2. Create groups: `admin`, `user`, `guest`
3. Create a Space
4. Associate your user with the space and admin group

---

## Configuration Files

After setup, you'll have:

```
~/.stina/
├── settings.enc          # Encrypted MCP server config
├── stina.db              # SQLite with Tandoor cache tables
└── mcp-servers/
    └── tandoor-mcp/
        ├── src/          # Rust source
        └── target/
            └── release/
                └── tandoor-mcp  # Compiled binary
```

---

## Next Steps After Setup

1. **Test Basic Queries**:
   ```
   "Vad ska vi laga idag?"
   "Visa veckans menyplan"
   ```

2. **Test Smart Shopping**:
   ```
   "Skapa inköpslista för veckan"
   ```

3. **Import a Recipe**:
   ```
   "Importera recept från https://www.ica.se/recept/..."
   ```

4. **Check the detailed testing guide**: `TANDOOR_TESTING_GUIDE.md`

---

## Summary

| Setup Type | Time | Requirements | Features |
|------------|------|--------------|----------|
| **Full Setup** | ~30 min | Tandoor instance + Rust | All features working |
| **Testing Mode** | ~5 min | None | Tool definitions only |

**Recommendation**: Start with Testing Mode to verify the integration code, then move to Full Setup when you have a Tandoor instance ready.
