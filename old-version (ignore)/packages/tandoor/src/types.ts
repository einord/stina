/**
 * Tandoor Recipe Agent - Type Definitions
 *
 * TypeScript types for Tandoor API entities and internal data structures.
 */

/**
 * Tandoor Recipe
 */
export interface TandoorRecipe {
  id: number;
  name: string;
  description?: string;
  url?: string;
  image?: string;
  servings?: number;
  working_time?: number; // minutes
  waiting_time?: number; // minutes
  created_at: string;
  updated_at: string;
  keywords?: TandoorKeyword[];
  steps?: TandoorStep[];
}

/**
 * Tandoor Recipe Step
 */
export interface TandoorStep {
  id: number;
  name?: string;
  instruction: string;
  ingredients?: TandoorIngredient[];
  time?: number;
  order: number;
}

/**
 * Tandoor Ingredient
 */
export interface TandoorIngredient {
  id: number;
  food: TandoorFood;
  unit?: TandoorUnit;
  amount?: number;
  note?: string;
  is_header?: boolean;
  no_amount?: boolean;
}

/**
 * Tandoor Food
 */
export interface TandoorFood {
  id: number;
  name: string;
  plural_name?: string;
  description?: string;
}

/**
 * Tandoor Unit
 */
export interface TandoorUnit {
  id: number;
  name: string;
  plural_name?: string;
  description?: string;
}

/**
 * Tandoor Keyword
 */
export interface TandoorKeyword {
  id: number;
  name: string;
  description?: string;
}

/**
 * Tandoor Meal Plan
 */
export interface TandoorMealPlan {
  id: number;
  recipe: TandoorRecipe;
  meal_type: TandoorMealType;
  date: string; // YYYY-MM-DD
  servings?: number;
  note?: string;
}

/**
 * Tandoor Meal Type
 */
export interface TandoorMealType {
  id: number;
  name: string;
  order: number;
  created_by: number;
}

/**
 * Tandoor Shopping List Entry
 */
export interface TandoorShoppingListEntry {
  id: number;
  food: TandoorFood;
  unit?: TandoorUnit;
  amount?: number;
  checked: boolean;
  created_at: string;
  completed_at?: string;
}

/**
 * Tandoor Cook Log Entry
 */
export interface TandoorCookLog {
  id: number;
  recipe: TandoorRecipe;
  created_at: string;
  created_by: number;
  servings?: number;
  rating?: number;
}

/**
 * Local cached recipe
 */
export interface CachedRecipe {
  tandoor_id: number;
  name: string;
  url?: string;
  image_url?: string;
  ingredients: string; // JSON stringified TandoorIngredient[]
  cached_at: number; // Unix timestamp
}

/**
 * Local purchase history
 */
export interface PurchaseHistory {
  id: string;
  food_name: string;
  purchased_at: number; // Unix timestamp
  recipe_id?: number;
  amount?: number;
  unit?: string;
}

/**
 * Smart shopping suggestion
 */
export interface SmartSuggestion {
  food_name: string;
  last_used_in_recipe: number; // Unix timestamp
  frequency_score: number; // 0-1, how often this food is used
  days_since_last_use: number;
  suggest_skip: boolean;
  reason: string;
}

/**
 * Meal plan cache entry
 */
export interface MealPlanCache {
  date: string; // YYYY-MM-DD
  meal_type: string;
  recipe_id: number;
  cached_at: number; // Unix timestamp
}

/**
 * Smart shopping list item with suggestion metadata
 */
export interface SmartShoppingItem {
  food: TandoorFood;
  unit?: TandoorUnit;
  amount?: number;
  recipe_name: string;
  suggestion: SmartSuggestion | null;
  recommended_action: 'add' | 'skip' | 'maybe';
}

/**
 * Food category for heuristics and grouping
 */
export type FoodCategory = 'dairy' | 'fresh' | 'meat' | 'dry' | 'frozen' | 'spices' | 'unknown';

/**
 * Display names for food categories (Swedish)
 */
export const CATEGORY_DISPLAY_NAMES: Record<FoodCategory, string> = {
  dairy: '🥛 Mejeri',
  fresh: '🥬 Färskvaror',
  meat: '🍖 Kött & Fisk',
  dry: '🥫 Skafferi',
  frozen: '❄️ Fryst',
  spices: '🧂 Kryddor',
  unknown: '📦 Övrigt',
};

/**
 * Purchase intelligence options
 */
export interface PurchaseIntelligenceOptions {
  /** Days threshold for dairy products */
  dairyDaysThreshold?: number;
  /** Days threshold for fresh produce */
  freshDaysThreshold?: number;
  /** Days threshold for dry goods */
  dryDaysThreshold?: number;
  /** Minimum frequency score to suggest skip */
  minFrequencyForSkip?: number;
}
