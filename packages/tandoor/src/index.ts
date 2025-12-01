/**
 * Tandoor Recipe Agent - Main Package Export
 *
 * Public API for Tandoor integration in Stina.
 */

// Types
export type {
  TandoorRecipe,
  TandoorStep,
  TandoorIngredient,
  TandoorFood,
  TandoorUnit,
  TandoorKeyword,
  TandoorMealPlan,
  TandoorMealType,
  TandoorShoppingListEntry,
  TandoorCookLog,
  CachedRecipe,
  PurchaseHistory,
  SmartSuggestion,
  MealPlanCache,
  SmartShoppingItem,
  FoodCategory,
  PurchaseIntelligenceOptions
} from './types.js';

// Constants
export { CATEGORY_DISPLAY_NAMES } from './types.js';

// Cook History Analysis
export {
  analyzeCookHistory
} from './cook-history.js';

// Purchase Intelligence
export {
  categorizeFoodItem,
  shouldSkipItem,
  getRecommendedAction,
  createSmartShoppingItem
} from './purchase-intelligence.js';
