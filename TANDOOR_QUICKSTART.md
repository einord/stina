# Tandoor Integration - Quick Start

## ✅ What's Already Done

The Tandoor integration is **fully implemented** in your Stina codebase! Here's what exists:

### 1. **9 Tandoor Tools** (`packages/core/src/tools/definitions/tandoor.ts`)
- ✅ `tandoor_get_todays_meal` - Get today's planned meals
- ✅ `tandoor_get_weekly_menu` - Get weekly meal plan
- ✅ `tandoor_smart_shopping_list` - **Main feature** - Smart shopping with skip suggestions
- ✅ `tandoor_add_to_shopping_list` - Add items to shopping list
- ✅ `tandoor_get_shopping_list` - View current shopping list
- ✅ `tandoor_import_recipe` - Import recipe from URL
- ✅ `tandoor_search_recipes` - Search for recipes
- ✅ `tandoor_get_recipe` - Get detailed recipe info
- ✅ `tandoor_suggest_skip` - Analyze ingredient purchase suggestions

### 2. **Tools Registered** (`packages/core/src/tools.ts:41`)
```typescript
const toolDefinitions: ToolDefinition[] = [
  ...createBuiltinTools(...),
  ...todoTools,
  ...memoryTools,
  ...profileTools,
  ...tandoorTools,  // ← Already registered!
];
```

### 3. **Storage Layer** (`packages/store/src/tandoor.ts`)
- ✅ Recipe caching
- ✅ Purchase history tracking
- ✅ Smart suggestions cache
- ✅ Meal plan cache

### 4. **Intelligence Logic** (`packages/tandoor/src/`)
- ✅ Cook history analysis
- ✅ Smart skip recommendations:
  - Dairy: 7 days threshold
  - Fresh produce: 3 days threshold
  - Dry goods: 30 days threshold
- ✅ Food categorization
- ✅ Purchase intelligence

### 5. **Translations** (`packages/i18n/locales/*/tandoor.json`)
- ✅ Swedish (sv)
- ✅ English (en)

---

## 🚀 Two Ways to Test

### Option A: Without Tandoor Instance (Testing Mode) ⚡ Fast

**Test the integration code immediately** without setting up Tandoor:

1. **Verify tools are registered:**
   ```bash
   # Start Stina
   bun run dev:all

   # In the Stina UI, ask:
   "List all tools"
   # or
   "Vilka verktyg finns?"
   ```

   Expected: You'll see 9 `tandoor_*` tools listed

2. **Check database schema:**
   ```bash
   sqlite3 ~/.stina/stina.db ".tables" | grep tandoor
   ```

   Expected output:
   ```
   meal_plan_cache
   recipe_cache
   local_purchase_history
   smart_suggestions
   ```

3. **What you CAN test:**
   - ✅ Tool definitions are registered
   - ✅ Database schema exists
   - ✅ Code compiles and loads
   - ✅ Translations work

4. **What you CAN'T test:**
   - ❌ Actual MCP communication
   - ❌ Real recipe data
   - ❌ Live shopping list operations

---

### Option B: With Tandoor Instance (Full Setup) 🔧 Complete

**Full integration with a real Tandoor server:**

#### Step 1: Install Rust & Build MCP Server

```bash
./scripts/setup-tandoor-mcp.sh
```

This takes ~5-10 minutes and:
- Installs Rust (if needed)
- Clones tandoor-mcp repo to `~/.stina/mcp-servers/`
- Builds the MCP server binary

#### Step 2: Set Up Tandoor Instance

**Option 1: Use existing Tandoor**
If you already have a Tandoor instance, skip to credentials.

**Option 2: Run Tandoor with Docker**
```bash
# Quick Docker setup
docker run -d \
  --name tandoor \
  -p 8080:8080 \
  -e SECRET_KEY="your-secret-key-here" \
  -e DB_ENGINE=django.db.backends.sqlite3 \
  vabene1111/recipes
```

Visit http://localhost:8080 and create an admin account.

#### Step 3: Configure Credentials

```bash
# Add to ~/.zshrc or ~/.bashrc
export TANDOOR_BASE_URL="http://localhost:8080"
export TANDOOR_USERNAME="admin"
export TANDOOR_PASSWORD="your-password"

# Reload
source ~/.zshrc
```

#### Step 4: Configure Stina

```bash
bun scripts/configure-tandoor-mcp.ts
```

Expected output:
```
✅ Tandoor MCP server configured successfully!

Configuration:
   Name: tandoor
   Type: stdio
   Command: /Users/you/.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp
```

#### Step 5: Restart Stina

```bash
# Stop current (Ctrl+C)
bun run dev:all
```

Watch for:
```
[tools] Loading tools from tandoor...
[tools] Loaded 9 tools from tandoor
```

#### Step 6: Test!

Ask Stina:
```
"Vad ska vi laga idag?"
"Skapa inköpslista för veckan"
"Importera recept från https://www.ica.se/recept/..."
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `TANDOOR_SETUP_GUIDE.md` | Detailed setup instructions |
| `TANDOOR_TESTING_GUIDE.md` | Complete testing scenarios |
| `TANDOOR_QUICKSTART.md` | This file - quick overview |
| `scripts/setup-tandoor-mcp.sh` | Automated MCP server setup |
| `scripts/configure-tandoor-mcp.ts` | Configure Stina settings |

---

## 🎯 Recommended Path

1. **Start with Option A (Testing Mode)** → 5 minutes
   - Verify tools are registered
   - Check database schema
   - Confirm code works

2. **Then move to Option B (Full Setup)** → 30 minutes
   - When you're ready to use real recipes
   - Install Rust + build MCP server
   - Connect to Tandoor instance

---

## ❓ Common Questions

**Q: Do I need to manually start the MCP server?**
A: No! Stina automatically spawns it when needed via stdio.

**Q: Where is the MCP server binary?**
A: `~/.stina/mcp-servers/tandoor-mcp/target/release/tandoor-mcp`

**Q: Can I test without a Tandoor instance?**
A: Yes! The tools are registered and the code works. You just can't call the actual MCP server endpoints.

**Q: How do I know if it's working?**
A: Check Stina's console for `[tools] Loaded 9 tools from tandoor` on startup.

**Q: What if I get "Missing environment variables"?**
A: Make sure `TANDOOR_BASE_URL`, `TANDOOR_USERNAME`, and `TANDOOR_PASSWORD` are set and exported.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "cargo: command not found" | Run `./scripts/setup-tandoor-mcp.sh` - it installs Rust |
| "Failed to load tools from tandoor" | Check MCP server binary exists + has execute permissions |
| "Permission denied" from Tandoor | Configure Tandoor spaces/groups (see TANDOOR_SETUP_GUIDE.md) |
| Tools not showing in Stina | Restart Stina + check console logs |

---

## ✨ Next Steps

After setup:

1. **Read the testing guide**: `TANDOOR_TESTING_GUIDE.md`
2. **Try the smart shopping list**: Ask "Skapa inköpslista för veckan"
3. **Import recipes**: "Importera recept från [URL]"
4. **Check cook history**: Ask Stina to analyze purchase patterns

---

## 🎉 Summary

- ✅ Integration code is **100% complete**
- ✅ Tools are **already registered**
- ✅ Database schema is **ready**
- ⚙️ Just need to **connect to Tandoor MCP server** (Option B)
- 🚀 Or **test immediately** without Tandoor (Option A)

**Ready to start!** 🍳
