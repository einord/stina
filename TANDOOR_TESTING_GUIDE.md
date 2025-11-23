# Tandoor Integration Testing Guide

## Overview

The Tandoor integration is **fully implemented** and ready to test! This guide walks you through setting up and testing all 9 Tandoor tools with Stina.

## What's Already Done ✅

- ✅ **9 Tandoor tools** defined in `packages/core/src/tools/definitions/tandoor.ts`
- ✅ **Tools registered** in the tool registry (`packages/core/src/tools.ts`)
- ✅ **Storage layer** implemented in `packages/store/src/tandoor.ts`
- ✅ **Smart shopping intelligence** with cook history analysis
- ✅ **Caching system** for recipes and meal plans
- ✅ **i18n support** (Swedish + English)

## Available Tools

| Tool Name | Description |
|-----------|-------------|
| `tandoor_get_todays_meal` | Get today's planned meals |
| `tandoor_get_weekly_menu` | Get this week's meal plan |
| `tandoor_smart_shopping_list` | **⭐ Main feature** - Smart shopping list with skip suggestions |
| `tandoor_add_to_shopping_list` | Add items to Tandoor shopping list |
| `tandoor_get_shopping_list` | View current shopping list |
| `tandoor_import_recipe` | Import recipe from URL |
| `tandoor_search_recipes` | Search for recipes |
| `tandoor_get_recipe` | Get detailed recipe info |
| `tandoor_suggest_skip` | Analyze if an ingredient should be skipped |

---

## Step 1: Configure Tandoor MCP Server

### 1.1 Install the Tandoor MCP Server

The integration uses the external MCP server: **ChristopherJMiller/tandoor-mcp**

```bash
# Option 1: Install globally with npm
npm install -g @christophermiller/tandoor-mcp

# Option 2: Clone and run locally
git clone https://github.com/ChristopherJMiller/tandoor-mcp.git
cd tandoor-mcp
npm install
```

### 1.2 Configure MCP Server in Stina

You need to add the Tandoor MCP server to Stina's settings. Create or update the MCP server configuration:

```typescript
// Example configuration (you can do this programmatically or via GUI)
import { upsertMCPServer } from '@stina/settings';

await upsertMCPServer({
  name: 'tandoor',
  type: 'stdio', // or 'websocket' depending on server setup
  command: 'tandoor-mcp', // or path to the server executable
  url: 'https://your-tandoor-instance.com', // Your Tandoor instance URL
  // Optional OAuth config if needed:
  oauth: {
    authorizationUrl: 'https://your-tandoor/oauth/authorize',
    tokenUrl: 'https://your-tandoor/oauth/token',
    clientId: 'your-client-id',
    redirectUri: 'http://localhost:3000/callback'
  }
});
```

### 1.3 Verify MCP Server Connection

Once configured, Stina will automatically:
1. Connect to the Tandoor MCP server on startup
2. List available MCP tools via `refreshMCPToolCache()`
3. Make them available to the AI model

Check the logs when starting Stina to verify connection:
```
[tools] Loading tools from tandoor...
[tools] Loaded 9 tools from tandoor
```

---

## Step 2: Start Stina

Your dev environment is already running with `bun run dev:all`, which includes:
- ✅ Vue 3 frontend (desktop GUI)
- ✅ Electron app

If not running, start with:
```bash
bun run dev:all
```

Or test with other clients:
```bash
# TUI (Terminal UI)
bun run dev:tui

# CLI
bun run dev:cli
```

---

## Step 3: Testing Scenarios

### 3.1 Basic Meal Planning Test

**Test:** Get today's meal

**User prompt:**
```
"Vad ska vi laga idag?"
or
"What are we cooking today?"
```

**Expected behavior:**
- Stina should call `tandoor_get_todays_meal`
- Returns today's recipes with ingredients
- Response in Swedish: "Hittade X rätt(er) för idag"

**Verification:**
- Check tool invocation logs in database (`~/.stina/stina.db`)
- Verify response contains meal plan data

---

### 3.2 Weekly Menu Test

**Test:** Get weekly meal plan

**User prompt:**
```
"Visa veckans menyplan"
or
"Show me this week's menu"
```

**Expected behavior:**
- Stina calls `tandoor_get_weekly_menu`
- Returns 7 days of meal plans
- Starts from current Monday

**Verification:**
```sql
-- Check database for tool invocations
SELECT * FROM messages WHERE role = 'info' ORDER BY timestamp DESC LIMIT 10;
```

---

### 3.3 Smart Shopping List Test ⭐ (Main Feature)

**Test:** Generate intelligent shopping list

**User prompt:**
```
"Skapa inköpslista för veckan"
or
"Generate shopping list for the week"
```

**Expected behavior:**
1. Calls `tandoor_smart_shopping_list`
2. Fetches meal plans for date range
3. Gets cook log (historical data)
4. Analyzes each ingredient using:
   - **Dairy products**: Skip if used < 7 days ago
   - **Fresh produce**: Skip if used < 3 days ago
   - **Dry goods**: Skip if used < 30 days ago
5. Returns three lists:
   - **items_to_add**: Definitely buy these
   - **items_to_skip**: Probably not needed (with reason)
   - **items_maybe**: Uncertain - user decides

**Example response:**
```json
{
  "ok": true,
  "message": "Analyserade 5 recept från veckomeny",
  "items_to_add": [
    {
      "food_name": "Kycklingfile",
      "amount": 500,
      "unit": "g",
      "recommended_action": "add",
      "reason": "No recent purchase history"
    }
  ],
  "items_to_skip": [
    {
      "food_name": "Mjölk",
      "amount": 1,
      "unit": "l",
      "recommended_action": "skip",
      "reason": "Dairy product used 3 days ago (threshold: 7 days)"
    }
  ],
  "items_maybe": [
    {
      "food_name": "Lök",
      "recommended_action": "maybe",
      "reason": "Used 4 days ago - might need more"
    }
  ]
}
```

**Verification:**
- Check that analysis includes cook log data
- Verify categories are correctly applied
- Confirm skip logic works (check `/packages/tandoor/src/purchase-intelligence.ts`)

---

### 3.4 Recipe Import Test

**Test:** Import recipe from URL

**User prompt:**
```
"Importera recept från https://www.ica.se/recept/kottpaj-123456/"
```

**Expected behavior:**
- Calls `tandoor_import_recipe`
- MCP server parses the URL
- Extracts recipe data (ingredients, steps, metadata)
- Imports to Tandoor

**Verification:**
- Check Tandoor web interface for new recipe
- Verify recipe data is complete

---

### 3.5 Recipe Search Test

**Test:** Search for recipes

**User prompt:**
```
"Sök recept med kyckling"
or
"Find chicken recipes"
```

**Expected behavior:**
- Calls `tandoor_search_recipes` with query="kyckling"
- Returns up to 20 results (default limit)
- Results include recipe names and IDs

**Follow-up test:** Get detailed recipe
```
"Visa recept nummer 123"
```
- Calls `tandoor_get_recipe` with recipe_id=123
- Returns full recipe with ingredients and instructions

---

### 3.6 Shopping List Management Test

**Test:** View and add to shopping list

**User prompts:**
```
"Visa min inköpslista"           → tandoor_get_shopping_list
"Lägg till mjöl i inköpslistan"  → tandoor_add_to_shopping_list
```

**Expected behavior:**
- `get_shopping_list`: Returns current items
- `add_to_shopping_list`: Requires items array with food_id, amount, unit_id

---

### 3.7 Single Ingredient Analysis Test

**Test:** Analyze specific ingredient

**User prompt:**
```
"Bör jag köpa mjölk?"
or
"Should I buy milk?"
```

**Expected behavior:**
- Calls `tandoor_suggest_skip` with food_name="mjölk"
- Analyzes cook log
- Returns suggestion with reason
- Uses category logic (dairy = 7 days threshold)

---

## Step 4: Verify Storage Layer

### 4.1 Check Database Schema

The Tandoor storage creates these tables in `~/.stina/stina.db`:

```sql
-- View created tables
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%tandoor%';

-- Expected tables:
-- - recipe_cache
-- - local_purchase_history
-- - smart_suggestions
-- - meal_plan_cache
```

### 4.2 Inspect Cache Data

```sql
-- Check recipe cache
SELECT * FROM recipe_cache LIMIT 5;

-- Check meal plan cache
SELECT * FROM meal_plan_cache ORDER BY date DESC LIMIT 10;

-- Check purchase history
SELECT * FROM local_purchase_history ORDER BY purchased_at DESC LIMIT 20;

-- Check smart suggestions
SELECT * FROM smart_suggestions;
```

### 4.3 Test Cache Functions

From a TypeScript REPL or test file:

```typescript
import {
  getCachedRecipe,
  searchCachedRecipes,
  getPurchaseHistory,
  getCachedSuggestion
} from '@stina/store/tandoor';

// Test recipe cache
const recipe = getCachedRecipe(123);
console.log('Cached recipe:', recipe);

// Test search
const results = searchCachedRecipes('kyckling', 10);
console.log('Search results:', results);

// Test purchase history
const history = getPurchaseHistory('Mjölk');
console.log('Purchase history:', history);
```

---

## Step 5: Troubleshooting

### 5.1 MCP Server Connection Issues

**Problem:** "Failed to load tools from tandoor"

**Solutions:**
1. Verify MCP server is installed: `which tandoor-mcp`
2. Check server configuration in settings
3. Test server directly: `tandoor-mcp --help`
4. Check logs in Stina console for error messages

### 5.2 Tools Not Available

**Problem:** AI doesn't see Tandoor tools

**Solutions:**
1. Check tool registry: `getToolCatalog()` should include tandoor tools
2. Verify `refreshMCPToolCache()` was called on startup
3. Check that tools are registered in `/packages/core/src/tools.ts` line 41

### 5.3 No Cook History Data

**Problem:** Smart shopping list doesn't skip items

**Solutions:**
1. Verify Tandoor has cook log entries
2. Check MCP call to `get_cook_log` returns data
3. Test cook history analysis directly:
```typescript
import { analyzeCookHistory } from '@stina/tandoor';
const suggestion = analyzeCookHistory(cookLog, { food_name: 'Mjölk' });
console.log('Suggestion:', suggestion);
```

### 5.4 Authentication Errors

**Problem:** OAuth or API key issues

**Solutions:**
1. Check `~/.stina/settings.enc` for encrypted credentials
2. Verify OAuth flow completes (check redirect URI)
3. Test with API key instead of OAuth
4. Check Tandoor instance permissions

### 5.5 Database Errors

**Problem:** Cannot read/write cache

**Solutions:**
1. Check file permissions on `~/.stina/stina.db`
2. Verify schema was created: `registerToolSchema('store.tandoor', ...)`
3. Check for SQLite errors in logs
4. Reset database: `rm ~/.stina/stina.db` (⚠️ deletes all data)

---

## Step 6: Manual Testing Checklist

Use this checklist to systematically test all features:

### Basic Functionality
- [ ] Connect to Tandoor MCP server
- [ ] List available tools via `list_tools`
- [ ] Get today's meal plan
- [ ] Get weekly menu

### Smart Shopping List
- [ ] Generate shopping list for current week
- [ ] Verify cook log is fetched
- [ ] Check items are categorized correctly
- [ ] Confirm skip suggestions are accurate
- [ ] Test with different date ranges

### Recipe Management
- [ ] Search for recipes
- [ ] Get detailed recipe
- [ ] Import recipe from URL (ICA, Coop, etc.)

### Shopping List
- [ ] View current shopping list
- [ ] Add items to shopping list
- [ ] Verify items appear in Tandoor

### Ingredient Analysis
- [ ] Test suggest_skip for dairy product
- [ ] Test suggest_skip for fresh produce
- [ ] Test suggest_skip for dry goods
- [ ] Verify thresholds (7/3/30 days)

### Storage & Caching
- [ ] Verify recipes are cached
- [ ] Check meal plan cache works
- [ ] Confirm purchase history is logged
- [ ] Test suggestion cache

### Error Handling
- [ ] Handle missing meal plans gracefully
- [ ] Handle MCP server errors
- [ ] Handle invalid recipe IDs
- [ ] Handle empty shopping list

---

## Step 7: Teaching Stina to Use Tools

Stina learns to use tools through:

### 7.1 Tool Descriptions

Each tool has a detailed description in Swedish that explains:
- **När använda** (When to use)
- **Vad det returnerar** (What it returns)
- **Exempel** (Examples)

See `/packages/core/src/tools/definitions/tandoor.ts` lines 352-582

### 7.2 System Prompt

The AI model receives tool specs via:
```typescript
import { getToolSystemPrompt } from '@stina/core/tools';
const prompt = getToolSystemPrompt();
```

This includes:
- Tool names and descriptions
- Parameter schemas (JSON Schema format)
- Usage guidelines

### 7.3 Training Examples

To help Stina learn, you can:

1. **Have conversations** that demonstrate tool usage
2. **Provide feedback** when Stina uses wrong tool
3. **Add examples** to tool descriptions
4. **Create test conversations** in the database

Example training conversation:
```
User: "Vad ska vi laga idag?"
Assistant: [calls tandoor_get_todays_meal]
Assistant: "Idag ska vi laga Köttbullar med potatis!"

User: "Skapa inköpslista"
Assistant: [calls tandoor_smart_shopping_list]
Assistant: "Jag analyserade 5 recept. Du behöver köpa:
- Köttfärs (500g)
- Ägg (6 st)

Du kan skippa:
- Mjölk (köpt för 3 dagar sedan)"
```

### 7.4 Tool Discovery

Users can ask:
```
"Vilka Tandoor-verktyg finns?"
"What can you do with recipes?"
```

Stina will call `list_tools` and filter for "tandoor" tools.

---

## Expected Output Examples

### Smart Shopping List Output

```
Analyserade 5 recept från veckomeny

✅ LÄGG TILL (15 varor):
- Kycklingfile (500g) - Ingen historik
- Lök (3 st) - Sist använd för 5 dagar sedan
- Vitlök (2 klyftor) - Ingen historik
...

⏭️ SKIPPA (8 varor):
- Mjölk (1 l) - Mjölkprodukt använd för 3 dagar sedan (tröskel: 7 dagar)
- Bröd (1 limpa) - Färskvara använd för 1 dag sedan (tröskel: 3 dagar)
...

🤔 KANSKE (3 varor):
- Smör (200g) - Använd för 8 dagar sedan - kan behövas
- Ost (150g) - Använd för 4 dagar sedan - osäker
...

📊 Analys:
- Använder matlagningshistorik: Ja
- Historikposter: 45
- Recept analyserade: 5
```

---

## Performance Benchmarks

Expected response times:

| Operation | Expected Time |
|-----------|---------------|
| Get today's meal | < 500ms |
| Get weekly menu | < 1s |
| Smart shopping list | 2-5s (depends on cook log size) |
| Search recipes | < 1s |
| Import recipe | 3-10s (depends on URL) |
| Add to shopping list | < 500ms per item |

---

## Next Steps

After testing:

1. **Add unit tests** (no tests currently exist)
   - Test cook history analysis logic
   - Test category detection
   - Test skip recommendation logic

2. **Add integration tests**
   - Mock MCP server responses
   - Test full shopping list workflow
   - Test error handling

3. **Create test fixtures**
   - Sample cook logs
   - Sample meal plans
   - Sample recipes

4. **Document edge cases**
   - Empty cook log
   - Missing meal plans
   - Invalid recipe URLs
   - Network failures

5. **Add metrics/monitoring**
   - Track tool usage
   - Monitor cache hit rates
   - Log MCP call failures

---

## Useful Commands

```bash
# Start development
bun run dev:all          # Desktop + Electron
bun run dev:tui          # Terminal UI
bun run dev:cli          # Command line

# Inspect database
sqlite3 ~/.stina/stina.db
> .tables
> SELECT * FROM messages WHERE role = 'info' LIMIT 10;
> SELECT * FROM recipe_cache;

# Reset configuration
rm ~/.stina/settings.enc
rm ~/.stina/.k

# Reset database
rm ~/.stina/stina.db

# Lint and format
bun run lint
bun run format
bun run typecheck
```

---

## File Reference

| Component | File Path |
|-----------|-----------|
| Tool Definitions | `packages/core/src/tools/definitions/tandoor.ts` |
| Tool Registry | `packages/core/src/tools.ts` |
| Storage Layer | `packages/store/src/tandoor.ts` |
| Intelligence Logic | `packages/tandoor/src/purchase-intelligence.ts` |
| Cook History | `packages/tandoor/src/cook-history.ts` |
| Types | `packages/tandoor/src/types.ts` |
| Translations | `packages/i18n/locales/sv/tandoor.json` |
| Translations | `packages/i18n/locales/en/tandoor.json` |

---

## Questions?

If you encounter issues:

1. Check the logs in the console
2. Inspect `~/.stina/stina.db` for tool invocations
3. Verify MCP server connection
4. Test individual functions in isolation
5. Check this guide's troubleshooting section

Happy testing! 🎉
