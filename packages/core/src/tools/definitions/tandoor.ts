/**
 * Tandoor Recipe Agent - Tool Definitions
 *
 * Smart recipe management tools with integrated purchase intelligence.
 * Uses ChristopherJMiller/tandoor-mcp MCP server.
 */

import { callMCPTool } from '@stina/mcp';
import {
  analyzeCookHistory,
  createSmartShoppingItem,
  shouldSkipItem,
  type SmartShoppingItem,
  type TandoorCookLog,
  type TandoorMealPlan,
  type TandoorShoppingListEntry,
} from '@stina/tandoor';

import type { ToolDefinition } from '../base.js';

const TANDOOR_MCP_SERVER = 'tandoor';

/**
 * Get today's meal plan with recipe details
 */
async function handleGetTodaysMeal(args: unknown) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const result = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_meal_plans', {
      start_date: today,
      end_date: today,
    })) as { meal_plans?: TandoorMealPlan[] };

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
    const result = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_meal_plans', {
      start_date: startDate,
      end_date: endDate,
    })) as { meal_plans?: TandoorMealPlan[] };

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

    const mealPlansResult = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_meal_plans', {
      start_date: startDate,
      end_date: endDate,
    })) as { meal_plans?: TandoorMealPlan[] };

    const mealPlans = mealPlansResult.meal_plans || [];

    if (mealPlans.length === 0) {
      return {
        ok: true,
        message: 'Inga recept planerade för denna period',
        items: [],
      };
    }

    // 2. Get cook log for historical analysis
    const cookLogResult = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_cook_log', {
      limit: 100,
    })) as { cook_log?: TandoorCookLog[] };

    const cookLog = cookLogResult.cook_log || [];

    // 3. Extract all ingredients from meal plans
    const smartItems: SmartShoppingItem[] = [];
    const seenFoods = new Set<string>();

    for (const mealPlan of mealPlans) {
      const recipe = mealPlan.recipe;
      if (!recipe.steps) continue;

      for (const step of recipe.steps) {
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
            recipe.name,
            suggestion
          );

          smartItems.push(smartItem);
        }
      }
    }

    // 4. Group by recommendation
    const itemsToAdd = smartItems.filter((item) => item.recommended_action === 'add');
    const itemsToSkip = smartItems.filter((item) => item.recommended_action === 'skip');
    const itemsMaybe = smartItems.filter((item) => item.recommended_action === 'maybe');

    return {
      ok: true,
      message: `Analyserade ${mealPlans.length} recept från veckomeny`,
      items_to_add: itemsToAdd,
      items_to_skip: itemsToSkip,
      items_maybe: itemsMaybe,
      total_items: smartItems.length,
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
      const result = await callMCPTool(TANDOOR_MCP_SERVER, 'add_to_shopping_list', {
        food_id: itemPayload.food_id,
        amount: itemPayload.amount,
        unit_id: itemPayload.unit_id,
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
    const result = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_shopping_list', {})) as {
      items?: TandoorShoppingListEntry[];
    };

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
    const result = await callMCPTool(TANDOOR_MCP_SERVER, 'import_recipe_from_url', {
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
    const result = await callMCPTool(TANDOOR_MCP_SERVER, 'search_recipes', {
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
    const result = await callMCPTool(TANDOOR_MCP_SERVER, 'get_recipe_details', {
      recipe_id: recipeId,
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
    const cookLogResult = (await callMCPTool(TANDOOR_MCP_SERVER, 'get_cook_log', {
      limit: 100,
    })) as { cook_log?: TandoorCookLog[] };

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
- items_maybe: Osäker - låt användaren bestämma`,
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
