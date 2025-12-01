/**
 * Tandoor Recipe Agent - Storage Layer
 *
 * Local caching and purchase history tracking for Tandoor recipes.
 */

import { desc, eq, gte, like } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { SQLiteTableWithColumns, TableConfig } from 'drizzle-orm/sqlite-core';

import store from './index_new.js';

const MODULE = 'tandoor';

// ============================================================================
// Schema Definition
// ============================================================================

export const recipeCacheTable = sqliteTable(
  'recipe_cache',
  {
    tandoorId: integer('tandoor_id').primaryKey(),
    name: text().notNull(),
    url: text(),
    imageUrl: text('image_url'),
    ingredients: text().notNull(), // JSON
    cachedAt: integer('cached_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    nameIdx: index('idx_recipe_cache_name').on(table.name),
    cachedAtIdx: index('idx_recipe_cache_cached_at').on(table.cachedAt),
  }),
);

export const purchaseHistoryTable = sqliteTable(
  'local_purchase_history',
  {
    id: text().primaryKey(),
    foodName: text('food_name').notNull(),
    purchasedAt: integer('purchased_at', { mode: 'number' }).notNull(),
    recipeId: integer('recipe_id'),
    amount: real(),
    unit: text(),
  },
  (table) => ({
    foodIdx: index('idx_purchase_history_food').on(table.foodName),
    purchasedAtIdx: index('idx_purchase_history_purchased_at').on(table.purchasedAt),
    recipeIdx: index('idx_purchase_history_recipe').on(table.recipeId),
  }),
);

export const smartSuggestionsTable = sqliteTable('smart_suggestions', {
  foodName: text('food_name').primaryKey(),
  lastUsedInRecipe: integer('last_used_in_recipe', { mode: 'number' }).notNull(),
  frequencyScore: real('frequency_score').notNull(),
  daysSinceLastUse: integer('days_since_last_use', { mode: 'number' }).notNull(),
  suggestSkip: integer('suggest_skip', { mode: 'boolean' }).notNull(),
  reason: text().notNull(),
});

export const mealPlanCacheTable = sqliteTable(
  'meal_plan_cache',
  {
    date: text().notNull(),
    mealType: text('meal_type').notNull(),
    recipeId: integer('recipe_id').notNull(),
    cachedAt: integer('cached_at', { mode: 'number' }).notNull(),
  },
  (table) => ({
    dateIdx: index('idx_meal_plan_date').on(table.date),
    pk: index('idx_meal_plan_pk').on(table.date, table.mealType),
  }),
);

export const tandoorTables = {
  recipeCacheTable,
  purchaseHistoryTable,
  smartSuggestionsTable,
  mealPlanCacheTable,
};

// ============================================================================
// Types
// ============================================================================

export interface CachedRecipe {
  tandoorId: number;
  name: string;
  url?: string;
  imageUrl?: string;
  ingredients: unknown[];
  cachedAt: number;
}

export interface PurchaseHistoryEntry {
  id: string;
  foodName: string;
  purchasedAt: number;
  recipeId?: number;
  amount?: number;
  unit?: string;
}

export interface SmartSuggestion {
  foodName: string;
  lastUsedInRecipe: number;
  frequencyScore: number;
  daysSinceLastUse: number;
  suggestSkip: boolean;
  reason: string;
}

export interface MealPlanCacheEntry {
  date: string;
  mealType: string;
  recipeId: number;
  cachedAt: number;
}

// ============================================================================
// Repository
// ============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

class TandoorRepository {
  constructor(
    private readonly db = store.getDatabase(),
    private readonly emitChange: (p: unknown) => void,
  ) {}

  onChange(listener: (payload: unknown) => void) {
    return store.onChange(MODULE, listener);
  }

  // --------------------------------------------------------------------------
  // Recipe Cache Operations
  // --------------------------------------------------------------------------

  async cacheRecipe(recipe: {
    tandoorId: number;
    name: string;
    url?: string;
    imageUrl?: string;
    ingredients: unknown[];
  }): Promise<void> {
    await this.db
      .insert(recipeCacheTable)
      .values({
        tandoorId: recipe.tandoorId,
        name: recipe.name,
        url: recipe.url ?? null,
        imageUrl: recipe.imageUrl ?? null,
        ingredients: JSON.stringify(recipe.ingredients),
        cachedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: recipeCacheTable.tandoorId,
        set: {
          name: recipe.name,
          url: recipe.url ?? null,
          imageUrl: recipe.imageUrl ?? null,
          ingredients: JSON.stringify(recipe.ingredients),
          cachedAt: Date.now(),
        },
      });
    this.emitChange({ kind: 'recipe_cache', tandoorId: recipe.tandoorId });
  }

  async getCachedRecipe(tandoorId: number): Promise<CachedRecipe | null> {
    const rows = await this.db
      .select()
      .from(recipeCacheTable)
      .where(eq(recipeCacheTable.tandoorId, tandoorId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      tandoorId: row.tandoorId,
      name: row.name,
      url: row.url ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
      ingredients: JSON.parse(row.ingredients),
      cachedAt: row.cachedAt,
    };
  }

  async searchCachedRecipes(query: string, limit = 20): Promise<CachedRecipe[]> {
    const rows = await this.db
      .select()
      .from(recipeCacheTable)
      .where(like(recipeCacheTable.name, `%${query}%`))
      .limit(limit);

    return rows.map((row) => ({
      tandoorId: row.tandoorId,
      name: row.name,
      url: row.url ?? undefined,
      imageUrl: row.imageUrl ?? undefined,
      ingredients: JSON.parse(row.ingredients),
      cachedAt: row.cachedAt,
    }));
  }

  async clearOldRecipeCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const raw = store.getRawDatabase();
    const result = raw.prepare('DELETE FROM recipe_cache WHERE cached_at < ?').run(cutoff);
    this.emitChange({ kind: 'recipe_cache_cleared' });
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Purchase History Operations
  // --------------------------------------------------------------------------

  async logPurchase(entry: {
    id?: string;
    foodName: string;
    purchasedAt?: number;
    recipeId?: number;
    amount?: number;
    unit?: string;
  }): Promise<PurchaseHistoryEntry> {
    const historyEntry: PurchaseHistoryEntry = {
      id: entry.id ?? generateId(),
      foodName: entry.foodName,
      purchasedAt: entry.purchasedAt ?? Date.now(),
      recipeId: entry.recipeId,
      amount: entry.amount,
      unit: entry.unit,
    };

    await this.db.insert(purchaseHistoryTable).values({
      id: historyEntry.id,
      foodName: historyEntry.foodName,
      purchasedAt: historyEntry.purchasedAt,
      recipeId: historyEntry.recipeId ?? null,
      amount: historyEntry.amount ?? null,
      unit: historyEntry.unit ?? null,
    });

    this.emitChange({ kind: 'purchase', id: historyEntry.id });
    return historyEntry;
  }

  async getPurchaseHistory(foodName?: string, limit = 100): Promise<PurchaseHistoryEntry[]> {
    const query = foodName
      ? this.db
          .select()
          .from(purchaseHistoryTable)
          .where(eq(purchaseHistoryTable.foodName, foodName))
          .orderBy(desc(purchaseHistoryTable.purchasedAt))
          .limit(limit)
      : this.db
          .select()
          .from(purchaseHistoryTable)
          .orderBy(desc(purchaseHistoryTable.purchasedAt))
          .limit(limit);

    const rows = await query;

    return rows.map((row) => ({
      id: row.id,
      foodName: row.foodName,
      purchasedAt: row.purchasedAt,
      recipeId: row.recipeId ?? undefined,
      amount: row.amount ?? undefined,
      unit: row.unit ?? undefined,
    }));
  }

  async getRecentPurchases(daysBack = 30): Promise<PurchaseHistoryEntry[]> {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const rows = await this.db
      .select()
      .from(purchaseHistoryTable)
      .where(gte(purchaseHistoryTable.purchasedAt, cutoff))
      .orderBy(desc(purchaseHistoryTable.purchasedAt));

    return rows.map((row) => ({
      id: row.id,
      foodName: row.foodName,
      purchasedAt: row.purchasedAt,
      recipeId: row.recipeId ?? undefined,
      amount: row.amount ?? undefined,
      unit: row.unit ?? undefined,
    }));
  }

  // --------------------------------------------------------------------------
  // Smart Suggestions Operations
  // --------------------------------------------------------------------------

  async cacheSuggestion(suggestion: SmartSuggestion): Promise<void> {
    await this.db
      .insert(smartSuggestionsTable)
      .values({
        foodName: suggestion.foodName,
        lastUsedInRecipe: suggestion.lastUsedInRecipe,
        frequencyScore: suggestion.frequencyScore,
        daysSinceLastUse: suggestion.daysSinceLastUse,
        suggestSkip: suggestion.suggestSkip,
        reason: suggestion.reason,
      })
      .onConflictDoUpdate({
        target: smartSuggestionsTable.foodName,
        set: {
          lastUsedInRecipe: suggestion.lastUsedInRecipe,
          frequencyScore: suggestion.frequencyScore,
          daysSinceLastUse: suggestion.daysSinceLastUse,
          suggestSkip: suggestion.suggestSkip,
          reason: suggestion.reason,
        },
      });
    this.emitChange({ kind: 'suggestion', foodName: suggestion.foodName });
  }

  async getCachedSuggestion(foodName: string): Promise<SmartSuggestion | null> {
    const rows = await this.db
      .select()
      .from(smartSuggestionsTable)
      .where(eq(smartSuggestionsTable.foodName, foodName))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      foodName: row.foodName,
      lastUsedInRecipe: row.lastUsedInRecipe,
      frequencyScore: row.frequencyScore,
      daysSinceLastUse: row.daysSinceLastUse,
      suggestSkip: row.suggestSkip,
      reason: row.reason,
    };
  }

  async clearOldSuggestions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const raw = store.getRawDatabase();
    const result = raw
      .prepare('DELETE FROM smart_suggestions WHERE last_used_in_recipe < ?')
      .run(cutoff);
    this.emitChange({ kind: 'suggestions_cleared' });
    return result.changes;
  }

  // --------------------------------------------------------------------------
  // Meal Plan Cache Operations
  // --------------------------------------------------------------------------

  async cacheMealPlan(entry: { date: string; mealType: string; recipeId: number }): Promise<void> {
    const raw = store.getRawDatabase();
    raw
      .prepare(
        `INSERT OR REPLACE INTO meal_plan_cache (date, meal_type, recipe_id, cached_at)
       VALUES (?, ?, ?, ?)`,
      )
      .run(entry.date, entry.mealType, entry.recipeId, Date.now());
    this.emitChange({ kind: 'meal_plan', date: entry.date });
  }

  async getCachedMealPlans(startDate: string, endDate: string): Promise<MealPlanCacheEntry[]> {
    const raw = store.getRawDatabase();
    const rows = raw
      .prepare('SELECT * FROM meal_plan_cache WHERE date >= ? AND date <= ? ORDER BY date ASC')
      .all(startDate, endDate) as Array<{
      date: string;
      meal_type: string;
      recipe_id: number;
      cached_at: number;
    }>;

    return rows.map((row) => ({
      date: row.date,
      mealType: row.meal_type,
      recipeId: row.recipe_id,
      cachedAt: row.cached_at,
    }));
  }

  async clearOldMealPlanCache(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const raw = store.getRawDatabase();
    const result = raw.prepare('DELETE FROM meal_plan_cache WHERE cached_at < ?').run(cutoff);
    this.emitChange({ kind: 'meal_plan_cleared' });
    return result.changes;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let repo: TandoorRepository | null = null;

/**
 * Returns the singleton tandoor repository, registering schema + events on first use.
 */
export function getTandoorRepository(): TandoorRepository {
  if (repo) return repo;
  const { api } = store.registerModule({
    name: MODULE,
    schema: () => tandoorTables as unknown as Record<string, SQLiteTableWithColumns<TableConfig>>,
    bootstrap: ({ db, emitChange }) => new TandoorRepository(db, emitChange),
  });
  repo =
    (api as TandoorRepository | undefined) ??
    new TandoorRepository(store.getDatabase(), () => undefined);
  return repo;
}

// Legacy function exports for backwards compatibility
export function cacheRecipe(recipe: Parameters<TandoorRepository['cacheRecipe']>[0]): void {
  void getTandoorRepository().cacheRecipe(recipe);
}

export function getCachedRecipe(tandoorId: number): Promise<CachedRecipe | null> {
  return getTandoorRepository().getCachedRecipe(tandoorId);
}

export function searchCachedRecipes(query: string, limit = 20): Promise<CachedRecipe[]> {
  return getTandoorRepository().searchCachedRecipes(query, limit);
}

export function clearOldRecipeCache(maxAgeMs?: number): Promise<number> {
  return getTandoorRepository().clearOldRecipeCache(maxAgeMs);
}

export function logPurchase(
  entry: Parameters<TandoorRepository['logPurchase']>[0],
): Promise<PurchaseHistoryEntry> {
  return getTandoorRepository().logPurchase(entry);
}

export function getPurchaseHistory(
  foodName?: string,
  limit?: number,
): Promise<PurchaseHistoryEntry[]> {
  return getTandoorRepository().getPurchaseHistory(foodName, limit);
}

export function getRecentPurchases(daysBack?: number): Promise<PurchaseHistoryEntry[]> {
  return getTandoorRepository().getRecentPurchases(daysBack);
}

export function cacheSuggestion(suggestion: SmartSuggestion): void {
  void getTandoorRepository().cacheSuggestion(suggestion);
}

export function getCachedSuggestion(foodName: string): Promise<SmartSuggestion | null> {
  return getTandoorRepository().getCachedSuggestion(foodName);
}

export function clearOldSuggestions(maxAgeMs?: number): Promise<number> {
  return getTandoorRepository().clearOldSuggestions(maxAgeMs);
}

export function cacheMealPlan(entry: Parameters<TandoorRepository['cacheMealPlan']>[0]): void {
  void getTandoorRepository().cacheMealPlan(entry);
}

export function getCachedMealPlans(
  startDate: string,
  endDate: string,
): Promise<MealPlanCacheEntry[]> {
  return getTandoorRepository().getCachedMealPlans(startDate, endDate);
}

export function clearOldMealPlanCache(maxAgeMs?: number): Promise<number> {
  return getTandoorRepository().clearOldMealPlanCache(maxAgeMs);
}
