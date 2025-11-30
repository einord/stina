/**
 * Tandoor Recipe Agent - Tool Definitions
 *
 * Smart recipe management tools with integrated purchase intelligence.
 * Uses ChristopherJMiller/tandoor-mcp MCP server via stdio transport.
 */

import { callMCPToolByName } from '../infrastructure/mcp-caller.js';
import {
  analyzeCookHistory,
  categorizeFoodItem,
  CATEGORY_DISPLAY_NAMES,
  createSmartShoppingItem,
  shouldSkipItem,
  type FoodCategory,
  type SmartShoppingItem,
  type TandoorCookLog,
  type TandoorMealPlan,
  type TandoorShoppingListEntry,
} from '@stina/tandoor';

import type { ToolDefinition } from '../infrastructure/base.js';

const TANDOOR_MCP_SERVER = 'tandoor';

/**
 * Get today's meal plan with recipe details
 */
async function handleGetTodaysMeal(args: unknown) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const rawResult = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_meal_plans', {
      start_date: today,
      end_date: today,
    });
    const result = parseMCPResponse<{ meal_plans?: TandoorMealPlan[] }>(rawResult);

    if (!result.meal_plans || result.meal_plans.length === 0) {
      return {
        ok: true,
        message: 'Ingen rätt planerad för idag.',
        meal_plans: [],
      };
    }

    return {
      ok: true,
      message: `Hittade ${result.meal_plans.length} rätt(er) för idag`,
      meal_plans: result.meal_plans,
      date: today,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Get weekly meal plan
 */
async function handleGetWeeklyMenu(args: unknown) {
  const payload = toRecord(args);
  const startDate =
    typeof payload.start_date === 'string' ? payload.start_date : getWeekStart();

  try {
    const endDate = addDays(startDate, 7);
    const rawResult = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_meal_plans', {
      start_date: startDate,
      end_date: endDate,
    });
    const result = parseMCPResponse<{ meal_plans?: TandoorMealPlan[] }>(rawResult);

    return {
      ok: true,
      message: `Hämtade veckomeny från ${startDate}`,
      meal_plans: result.meal_plans || [],
      start_date: startDate,
      end_date: endDate,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Generate smart shopping list with purchase intelligence
 */
async function handleSmartShoppingList(args: unknown) {
  const payload = toRecord(args);

  try {
    // 1. Get meal plans for date range
    const startDate =
      typeof payload.start_date === 'string' ? payload.start_date : new Date().toISOString().split('T')[0];
    const endDate =
      typeof payload.end_date === 'string'
        ? payload.end_date
        : addDays(startDate, parseInt(String(payload.days ?? 7)));

    const rawMealPlans = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_meal_plans', {
      start_date: startDate,
      end_date: endDate,
    });
    const mealPlansResult = parseMCPResponse<{ meal_plans?: TandoorMealPlan[] }>(rawMealPlans);

    const mealPlans = mealPlansResult.meal_plans || [];

    if (mealPlans.length === 0) {
      return {
        ok: true,
        message: 'Inga recept planerade för denna period',
        items: [],
      };
    }

    // 2. Get cook log for historical analysis
    const rawCookLog = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_cook_log', {
      limit: 100,
    });
    const cookLogResult = parseMCPResponse<{ cook_log?: TandoorCookLog[] }>(rawCookLog);

    const cookLog = cookLogResult.cook_log || [];

    // 3. Fetch full recipe details for each meal plan (meal plans only have basic recipe info)
    interface SmartItemWithCategory extends SmartShoppingItem {
      category: FoodCategory;
      category_display: string;
    }
    const smartItems: SmartItemWithCategory[] = [];
    const seenFoods = new Set<string>();
    const fetchedRecipeIds = new Set<number>();

    for (const mealPlan of mealPlans) {
      const recipeId = mealPlan.recipe.id;

      // Skip if we already processed this recipe
      if (fetchedRecipeIds.has(recipeId)) continue;
      fetchedRecipeIds.add(recipeId);

      // Fetch full recipe with steps and ingredients
      const rawRecipe = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_recipe', {
        id: recipeId,
      });
      const fullRecipe = parseMCPResponse<TandoorMealPlan['recipe'] & { steps?: Array<{ ingredients?: Array<{ food: { id: number; name: string }; unit?: { id: number; name: string }; amount?: number; is_header?: boolean }> }> }>(rawRecipe);

      if (!fullRecipe.steps) continue;

      for (const step of fullRecipe.steps) {
        if (!step.ingredients) continue;

        for (const ingredient of step.ingredients) {
          const foodName = ingredient.food.name;

          // Skip headers and duplicates
          if (ingredient.is_header || seenFoods.has(foodName)) {
            continue;
          }
          seenFoods.add(foodName);

          // Analyze cook history
          const suggestion = analyzeCookHistory(cookLog, { food_name: foodName });

          // Create smart item with recommendation
          const smartItem = createSmartShoppingItem(
            ingredient.food,
            ingredient.unit,
            ingredient.amount,
            fullRecipe.name,
            suggestion
          );

          // Add category information
          const category = categorizeFoodItem(foodName);
          const itemWithCategory: SmartItemWithCategory = {
            ...smartItem,
            category,
            category_display: CATEGORY_DISPLAY_NAMES[category],
          };

          smartItems.push(itemWithCategory);
        }
      }
    }

    // 4. Group by recommendation
    const itemsToAdd = smartItems.filter((item) => item.recommended_action === 'add');
    const itemsToSkip = smartItems.filter((item) => item.recommended_action === 'skip');
    const itemsMaybe = smartItems.filter((item) => item.recommended_action === 'maybe');

    // 5. Group items_to_add by category for easier presentation
    const groupedByCategory: Record<string, SmartItemWithCategory[]> = {};
    for (const item of itemsToAdd) {
      const categoryKey = item.category_display;
      if (!groupedByCategory[categoryKey]) {
        groupedByCategory[categoryKey] = [];
      }
      groupedByCategory[categoryKey].push(item);
    }

    return {
      ok: true,
      message: `Analyserade ${mealPlans.length} recept från veckomeny`,
      items_to_add: itemsToAdd,
      items_to_add_grouped: groupedByCategory,
      items_to_skip: itemsToSkip,
      items_maybe: itemsMaybe,
      total_items: smartItems.length,
      category_order: Object.values(CATEGORY_DISPLAY_NAMES),
      analysis: {
        using_cook_log: cookLog.length > 0,
        cook_log_entries: cookLog.length,
        meal_plans_analyzed: mealPlans.length,
      },
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Add items to Tandoor shopping list
 */
async function handleAddToShoppingList(args: unknown) {
  const payload = toRecord(args);
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (items.length === 0) {
    return { ok: false, error: 'No items provided' };
  }

  try {
    const results = [];
    for (const item of items) {
      const itemPayload = toRecord(item);
      const result = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_add_to_shopping_list', {
        food_id: typeof itemPayload.food_id === 'number' ? itemPayload.food_id : 0,
        amount: typeof itemPayload.amount === 'number' ? itemPayload.amount : undefined,
        unit_id: typeof itemPayload.unit_id === 'number' ? itemPayload.unit_id : undefined,
      });
      results.push(result);
    }

    return {
      ok: true,
      message: `Lade till ${items.length} varor i inköpslistan`,
      results,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Get current shopping list from Tandoor
 */
async function handleGetShoppingList(args: unknown) {
  try {
    const rawResult = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_shopping_list', {});
    const result = parseMCPResponse<{ items?: TandoorShoppingListEntry[] }>(rawResult);

    return {
      ok: true,
      items: result.items || [],
      count: result.items?.length || 0,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Import recipe from URL using MCP server
 */
async function handleImportRecipe(args: unknown) {
  const payload = toRecord(args);
  const url = getString(payload, 'url');

  if (!url) {
    return { ok: false, error: 'URL is required' };
  }

  try {
    const result = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_import_recipe', {
      url,
    });

    return {
      ok: true,
      message: 'Recept importerat från URL',
      result,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Search recipes in Tandoor
 */
async function handleSearchRecipes(args: unknown) {
  const payload = toRecord(args);
  const query = getString(payload, 'query') || '';
  const limit = typeof payload.limit === 'number' ? payload.limit : 20;

  try {
    const result = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_search_recipes', {
      query,
      limit: Math.min(limit, 100),
    });

    return {
      ok: true,
      result,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Get detailed recipe information
 */
async function handleGetRecipe(args: unknown) {
  const payload = toRecord(args);
  const recipeId = payload.recipe_id;

  if (!recipeId) {
    return { ok: false, error: 'recipe_id is required' };
  }

  try {
    const result = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_recipe', {
      id: typeof recipeId === 'number' ? recipeId : Number(recipeId),
    });

    return {
      ok: true,
      result,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Analyze ingredient purchase suggestion
 */
async function handleSuggestSkip(args: unknown) {
  const payload = toRecord(args);
  const foodName = getString(payload, 'food_name');

  if (!foodName) {
    return { ok: false, error: 'food_name is required' };
  }

  try {
    // Get cook log
    const rawCookLog = await callMCPToolByName(TANDOOR_MCP_SERVER, 'tandoor_get_cook_log', {
      limit: 100,
    });
    const cookLogResult = parseMCPResponse<{ cook_log?: TandoorCookLog[] }>(rawCookLog);

    const cookLog = cookLogResult.cook_log || [];
    const suggestion = analyzeCookHistory(cookLog, { food_name: foodName });

    if (!suggestion) {
      return {
        ok: true,
        suggestion: null,
        message: `Ingen historik för "${foodName}" - rekommenderar att lägga till`,
      };
    }

    const { skip, reason } = shouldSkipItem(suggestion, foodName);

    return {
      ok: true,
      suggestion,
      should_skip: skip,
      reason,
      food_name: foodName,
    };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Export tool definitions
 */
export const tandoorTools: ToolDefinition[] = [
  {
    spec: {
      name: 'tandoor_get_todays_meal',
      description: `**Hämta dagens planerade måltider från Tandoor.**

Använd när:
- Användaren frågar "Vad ska vi laga idag?"
- Användaren vill veta dagens middag/lunch

Returnerar dagens recept med ingredienser och instruktioner.`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: handleGetTodaysMeal,
  },
  {
    spec: {
      name: 'tandoor_get_weekly_menu',
      description: `**Hämta veckans menyplan från Tandoor.**

Använd när:
- Användaren vill se veckans recept
- Användaren frågar "Vad ska vi laga denna vecka?"

Returnerar 7 dagars menyplan från angivet startdatum.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Startdatum i YYYY-MM-DD format. Standard: dagens datum.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleGetWeeklyMenu,
  },
  {
    spec: {
      name: 'tandoor_smart_shopping_list',
      description: `**Generera smart inköpslista med intelligenta förslag.**

Detta är Tandoor-agentens kraftfullaste verktyg! Det kombinerar:
1. Veckomenyns ingredienser
2. Matlagningshistorik (cook log)
3. Smart analys baserat på varukategori

Algoritmen föreslår SKIPPA för varor som:
- Mjölkprodukter användes < 7 dagar sedan
- Färskvaror användes < 3 dagar sedan
- Torra varor användes < 30 dagar sedan

Använd när:
- Användaren vill skapa inköpslista
- "Vad behöver vi handla denna vecka?"
- "Generera inköpslista från veckomeny"

Returnerar tre listor:
- items_to_add: Definitvt handla
- items_to_skip: Troligen inte slut
- items_maybe: Osäker - låt användaren bestämma

**VIKTIGT - När du presenterar resultatet för användaren:**

1. **Förenkla mängder**: Ta bort små mängder som "1 tsk", "2 msk" och visa bara ingrediensnamnet.
   Exempel: "1 tsk basilika" → "Basilika"
   Behåll dock större mängder som "500g köttfärs" eller "2 st paprika".

2. **Gruppera efter kategori**: Organisera listan i avdelningar:
   - 🥛 Mejeri (mjölk, ost, smör, grädde, yoghurt)
   - 🥬 Färskvaror (grönsaker, frukt, sallad)
   - 🍖 Kött & Fisk
   - 🥫 Skafferi (konserver, pasta, ris, kryddor)
   - ❄️ Fryst

3. **Slå ihop duplicerade ingredienser**: Om samma vara förekommer i flera recept, visa den bara en gång.

4. **Presentera tydligt**: Visa items_to_add som huvudlista, nämn items_maybe som "Kanske behövs" och hoppa över items_to_skip helt (eller nämn kort att de troligen finns hemma).`,
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Startdatum för menyplan i YYYY-MM-DD. Standard: idag.',
          },
          end_date: {
            type: 'string',
            description: 'Slutdatum för menyplan. Alternativt, använd "days" parameter.',
          },
          days: {
            type: 'integer',
            description: 'Antal dagar framåt från start_date. Standard: 7.',
          },
        },
        additionalProperties: false,
      },
    },
    handler: handleSmartShoppingList,
  },
  {
    spec: {
      name: 'tandoor_add_to_shopping_list',
      description: `**Lägg till varor i Tandoor inköpslista.**

Använd när:
- Användaren bekräftar vilka varor som ska läggas till
- Efter smart shopping list-analys

items-parametern ska vara en array av objekt med:
- food_id: Tandoor food ID
- amount: Mängd (optional)
- unit_id: Tandoor unit ID (optional)`,
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Array av varor att lägga till',
            items: {
              type: 'object',
              properties: {
                food_id: { type: 'integer' },
                amount: { type: 'number' },
                unit_id: { type: 'integer' },
              },
              required: ['food_id'],
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      },
    },
    handler: handleAddToShoppingList,
  },
  {
    spec: {
      name: 'tandoor_get_shopping_list',
      description: `**Hämta nuvarande inköpslista från Tandoor.**

Visar alla varor som finns i Tandoor inköpslista, inklusive checkade/uncheckade.`,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    handler: handleGetShoppingList,
  },
  {
    spec: {
      name: 'tandoor_import_recipe',
      description: `**Importera recept från URL till Tandoor.**

Använd när:
- Användaren säger "Importera recept från [URL]"
- Användaren vill lägga till recept från extern webbsida

Tandoor MCP-servern hanterar parsing och JSON-LD-generering.`,
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL till recept (t.ex. ICA, Coop, Arla)',
          },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
    handler: handleImportRecipe,
  },
  {
    spec: {
      name: 'tandoor_search_recipes',
      description: `**Sök recept i Tandoor.**

Använd när:
- Användaren söker efter specifikt recept
- "Hitta recept för köttbullar"
- "Sök recept med kyckling"`,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Sökterm',
          },
          limit: {
            type: 'integer',
            description: 'Max antal resultat. Standard: 20, Max: 100.',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    handler: handleSearchRecipes,
  },
  {
    spec: {
      name: 'tandoor_get_recipe',
      description: `**Hämta detaljerad receptinformation.**

Använd när:
- Användaren vill se fullständigt recept
- Behöver ingredienser och instruktioner

Kräver recipe_id från tidigare sök eller menyplan.`,
      parameters: {
        type: 'object',
        properties: {
          recipe_id: {
            type: 'integer',
            description: 'Tandoor recipe ID',
          },
        },
        required: ['recipe_id'],
        additionalProperties: false,
      },
    },
    handler: handleGetRecipe,
  },
  {
    spec: {
      name: 'tandoor_suggest_skip',
      description: `**Analysera om en specifik vara bör skippas baserat på historik.**

Använd när:
- Användaren vill veta om en vara troligen inte är slut
- Detaljerad analys av enskild ingrediens behövs

Returnerar förslag med motivering baserat på cook log.`,
      parameters: {
        type: 'object',
        properties: {
          food_name: {
            type: 'string',
            description: 'Namn på varan att analysera (t.ex. "Mjölk", "Lök")',
          },
        },
        required: ['food_name'],
        additionalProperties: false,
      },
    },
    handler: handleSuggestSkip,
  },
];

// Utility functions

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday as start
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * Parse MCP tool response - handles the { content: [{ type: "text", text: "..." }] } format
 */
function parseMCPResponse<T>(result: unknown): T {
  const record = toRecord(result);

  // Check if it's MCP format with content array
  if (Array.isArray(record.content) && record.content.length > 0) {
    const firstContent = record.content[0] as Record<string, unknown>;
    if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
      try {
        return JSON.parse(firstContent.text) as T;
      } catch {
        // If parsing fails, return empty object
        return {} as T;
      }
    }
  }

  // Already in expected format
  return result as T;
}
