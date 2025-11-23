/**
 * Tandoor Recipe Agent - Storage Layer
 *
 * Local caching and purchase history tracking for Tandoor recipes.
 */

import { registerToolSchema, withDatabase } from './toolkit.js';

const TANDOOR_SCHEMA_NAME = 'store.tandoor';

type RecipeCacheRow = {
  tandoor_id: number;
  name: string;
  url: string | null;
  image_url: string | null;
  ingredients: string; // JSON
  cached_at: number;
};

type PurchaseHistoryRow = {
  id: string;
  food_name: string;
  purchased_at: number;
  recipe_id: number | null;
  amount: number | null;
  unit: string | null;
};

type SmartSuggestionRow = {
  food_name: string;
  last_used_in_recipe: number;
  frequency_score: number;
  days_since_last_use: number;
  suggest_skip: number; // boolean stored as 0/1
  reason: string;
};

type MealPlanCacheRow = {
  date: string;
  meal_type: string;
  recipe_id: number;
  cached_at: number;
};

/**
 * Register Tandoor database schemas
 */
registerToolSchema(TANDOOR_SCHEMA_NAME, (db) => {
  db.exec(`
    -- Recipe cache for performance
    CREATE TABLE IF NOT EXISTS recipe_cache (
      tandoor_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      image_url TEXT,
      ingredients TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_cache_name ON recipe_cache(name);
    CREATE INDEX IF NOT EXISTS idx_recipe_cache_cached_at ON recipe_cache(cached_at);

    -- Local purchase history
    CREATE TABLE IF NOT EXISTS local_purchase_history (
      id TEXT PRIMARY KEY,
      food_name TEXT NOT NULL,
      purchased_at INTEGER NOT NULL,
      recipe_id INTEGER,
      amount REAL,
      unit TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_history_food ON local_purchase_history(food_name);
    CREATE INDEX IF NOT EXISTS idx_purchase_history_purchased_at ON local_purchase_history(purchased_at);
    CREATE INDEX IF NOT EXISTS idx_purchase_history_recipe ON local_purchase_history(recipe_id);

    -- Smart suggestions cache
    CREATE TABLE IF NOT EXISTS smart_suggestions (
      food_name TEXT PRIMARY KEY,
      last_used_in_recipe INTEGER NOT NULL,
      frequency_score REAL NOT NULL,
      days_since_last_use INTEGER NOT NULL,
      suggest_skip INTEGER NOT NULL,
      reason TEXT NOT NULL
    );

    -- Meal plan cache
    CREATE TABLE IF NOT EXISTS meal_plan_cache (
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      recipe_id INTEGER NOT NULL,
      cached_at INTEGER NOT NULL,
      PRIMARY KEY (date, meal_type)
    );
    CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan_cache(date);
  `);
});

/**
 * Recipe Cache Operations
 */

export interface CachedRecipe {
  tandoorId: number;
  name: string;
  url?: string;
  imageUrl?: string;
  ingredients: unknown[]; // Parsed from JSON
  cachedAt: number;
}

export function cacheRecipe(recipe: {
  tandoorId: number;
  name: string;
  url?: string;
  imageUrl?: string;
  ingredients: unknown[];
}): void {
  withDatabase((db) => {
    db.prepare(
      `INSERT OR REPLACE INTO recipe_cache
       (tandoor_id, name, url, image_url, ingredients, cached_at)
       VALUES (@tandoor_id, @name, @url, @image_url, @ingredients, @cached_at)`,
    ).run({
      tandoor_id: recipe.tandoorId,
      name: recipe.name,
      url: recipe.url ?? null,
      image_url: recipe.imageUrl ?? null,
      ingredients: JSON.stringify(recipe.ingredients),
      cached_at: Date.now(),
    });
  });
}

export function getCachedRecipe(tandoorId: number): CachedRecipe | null {
  return withDatabase((db) => {
    const row = db
      .prepare('SELECT * FROM recipe_cache WHERE tandoor_id = ?')
      .get(tandoorId) as RecipeCacheRow | undefined;

    if (!row) return null;

    return {
      tandoorId: row.tandoor_id,
      name: row.name,
      url: row.url ?? undefined,
      imageUrl: row.image_url ?? undefined,
      ingredients: JSON.parse(row.ingredients),
      cachedAt: row.cached_at,
    };
  });
}

export function searchCachedRecipes(query: string, limit = 20): CachedRecipe[] {
  return withDatabase((db) => {
    const rows = db
      .prepare(
        'SELECT * FROM recipe_cache WHERE name LIKE ? ORDER BY name ASC LIMIT ?',
      )
      .all(`%${query}%`, limit) as RecipeCacheRow[];

    return rows.map((row) => ({
      tandoorId: row.tandoor_id,
      name: row.name,
      url: row.url ?? undefined,
      imageUrl: row.image_url ?? undefined,
      ingredients: JSON.parse(row.ingredients),
      cachedAt: row.cached_at,
    }));
  });
}

export function clearOldRecipeCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  return withDatabase((db) => {
    const result = db
      .prepare('DELETE FROM recipe_cache WHERE cached_at < ?')
      .run(cutoff);
    return result.changes;
  });
}

/**
 * Purchase History Operations
 */

export interface PurchaseHistoryEntry {
  id: string;
  foodName: string;
  purchasedAt: number;
  recipeId?: number;
  amount?: number;
  unit?: string;
}

export function logPurchase(entry: {
  id?: string;
  foodName: string;
  purchasedAt?: number;
  recipeId?: number;
  amount?: number;
  unit?: string;
}): PurchaseHistoryEntry {
  const historyEntry: PurchaseHistoryEntry = {
    id: entry.id ?? generateId(),
    foodName: entry.foodName,
    purchasedAt: entry.purchasedAt ?? Date.now(),
    recipeId: entry.recipeId,
    amount: entry.amount,
    unit: entry.unit,
  };

  withDatabase((db) => {
    db.prepare(
      `INSERT INTO local_purchase_history
       (id, food_name, purchased_at, recipe_id, amount, unit)
       VALUES (@id, @food_name, @purchased_at, @recipe_id, @amount, @unit)`,
    ).run({
      id: historyEntry.id,
      food_name: historyEntry.foodName,
      purchased_at: historyEntry.purchasedAt,
      recipe_id: historyEntry.recipeId ?? null,
      amount: historyEntry.amount ?? null,
      unit: historyEntry.unit ?? null,
    });
  });

  return historyEntry;
}

export function getPurchaseHistory(foodName?: string, limit = 100): PurchaseHistoryEntry[] {
  return withDatabase((db) => {
    let sql = 'SELECT * FROM local_purchase_history';
    const params: unknown[] = [];

    if (foodName) {
      sql += ' WHERE food_name = ?';
      params.push(foodName);
    }

    sql += ' ORDER BY purchased_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as PurchaseHistoryRow[];

    return rows.map((row) => ({
      id: row.id,
      foodName: row.food_name,
      purchasedAt: row.purchased_at,
      recipeId: row.recipe_id ?? undefined,
      amount: row.amount ?? undefined,
      unit: row.unit ?? undefined,
    }));
  });
}

export function getRecentPurchases(daysBack = 30): PurchaseHistoryEntry[] {
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return withDatabase((db) => {
    const rows = db
      .prepare(
        'SELECT * FROM local_purchase_history WHERE purchased_at >= ? ORDER BY purchased_at DESC',
      )
      .all(cutoff) as PurchaseHistoryRow[];

    return rows.map((row) => ({
      id: row.id,
      foodName: row.food_name,
      purchasedAt: row.purchased_at,
      recipeId: row.recipe_id ?? undefined,
      amount: row.amount ?? undefined,
      unit: row.unit ?? undefined,
    }));
  });
}

/**
 * Smart Suggestions Operations
 */

export interface SmartSuggestion {
  foodName: string;
  lastUsedInRecipe: number;
  frequencyScore: number;
  daysSinceLastUse: number;
  suggestSkip: boolean;
  reason: string;
}

export function cacheSuggestion(suggestion: SmartSuggestion): void {
  withDatabase((db) => {
    db.prepare(
      `INSERT OR REPLACE INTO smart_suggestions
       (food_name, last_used_in_recipe, frequency_score, days_since_last_use, suggest_skip, reason)
       VALUES (@food_name, @last_used_in_recipe, @frequency_score, @days_since_last_use, @suggest_skip, @reason)`,
    ).run({
      food_name: suggestion.foodName,
      last_used_in_recipe: suggestion.lastUsedInRecipe,
      frequency_score: suggestion.frequencyScore,
      days_since_last_use: suggestion.daysSinceLastUse,
      suggest_skip: suggestion.suggestSkip ? 1 : 0,
      reason: suggestion.reason,
    });
  });
}

export function getCachedSuggestion(foodName: string): SmartSuggestion | null {
  return withDatabase((db) => {
    const row = db
      .prepare('SELECT * FROM smart_suggestions WHERE food_name = ?')
      .get(foodName) as SmartSuggestionRow | undefined;

    if (!row) return null;

    return {
      foodName: row.food_name,
      lastUsedInRecipe: row.last_used_in_recipe,
      frequencyScore: row.frequency_score,
      daysSinceLastUse: row.days_since_last_use,
      suggestSkip: row.suggest_skip === 1,
      reason: row.reason,
    };
  });
}

export function clearOldSuggestions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  return withDatabase((db) => {
    const result = db
      .prepare('DELETE FROM smart_suggestions WHERE last_used_in_recipe < ?')
      .run(cutoff);
    return result.changes;
  });
}

/**
 * Meal Plan Cache Operations
 */

export interface MealPlanCacheEntry {
  date: string;
  mealType: string;
  recipeId: number;
  cachedAt: number;
}

export function cacheMealPlan(entry: {
  date: string;
  mealType: string;
  recipeId: number;
}): void {
  withDatabase((db) => {
    db.prepare(
      `INSERT OR REPLACE INTO meal_plan_cache
       (date, meal_type, recipe_id, cached_at)
       VALUES (@date, @meal_type, @recipe_id, @cached_at)`,
    ).run({
      date: entry.date,
      meal_type: entry.mealType,
      recipe_id: entry.recipeId,
      cached_at: Date.now(),
    });
  });
}

export function getCachedMealPlans(
  startDate: string,
  endDate: string,
): MealPlanCacheEntry[] {
  return withDatabase((db) => {
    const rows = db
      .prepare(
        'SELECT * FROM meal_plan_cache WHERE date >= ? AND date <= ? ORDER BY date ASC',
      )
      .all(startDate, endDate) as MealPlanCacheRow[];

    return rows.map((row) => ({
      date: row.date,
      mealType: row.meal_type,
      recipeId: row.recipe_id,
      cachedAt: row.cached_at,
    }));
  });
}

export function clearOldMealPlanCache(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  return withDatabase((db) => {
    const result = db
      .prepare('DELETE FROM meal_plan_cache WHERE cached_at < ?')
      .run(cutoff);
    return result.changes;
  });
}

/**
 * Generate unique ID for purchase history entries
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
