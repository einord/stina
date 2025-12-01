/**
 * Tandoor Recipe Agent - Purchase Intelligence
 *
 * Smart shopping list suggestions based on cook history and food categories.
 */

import type {
  SmartSuggestion,
  FoodCategory,
  PurchaseIntelligenceOptions,
  SmartShoppingItem,
  TandoorFood,
  TandoorUnit
} from './types.js';

/**
 * Threshold in days for spices - they last a long time
 */
const SPICES_DAYS_THRESHOLD = 90;

/**
 * Default thresholds for different food categories (in days)
 */
const DEFAULT_OPTIONS: Required<PurchaseIntelligenceOptions> = {
  dairyDaysThreshold: 7,
  freshDaysThreshold: 3,
  dryDaysThreshold: 30,
  minFrequencyForSkip: 0.1
};

/**
 * Categorize food item based on name heuristics
 */
export function categorizeFoodItem(foodName: string): FoodCategory {
  const name = foodName.toLowerCase();

  // Spices and herbs - check first as they're often small quantities
  const spiceKeywords = [
    'basilika', 'basil', 'oregano', 'timjan', 'thyme', 'rosmarin', 'rosemary',
    'persilja', 'parsley', 'dill', 'koriander', 'cilantro', 'mint', 'mynta',
    'kanel', 'cinnamon', 'kardemumma', 'cardamom', 'ingefära', 'ginger',
    'gurkmeja', 'turmeric', 'paprikapulver', 'paprika powder', 'chili',
    'kummin', 'cumin', 'curry', 'muskotnöt', 'nutmeg', 'nejlika', 'clove',
    'lagerblad', 'bay leaf', 'saffran', 'saffron', 'vanilj', 'vanilla',
    'krydd', 'spice', 'herb', 'ört'
  ];
  if (spiceKeywords.some(keyword => name.includes(keyword))) {
    return 'spices';
  }

  // Meat and fish
  const meatKeywords = [
    'kött', 'meat', 'fläsk', 'pork', 'nöt', 'beef', 'kyckling', 'chicken',
    'kalkon', 'turkey', 'lamm', 'lamb', 'korv', 'sausage', 'bacon', 'skinka', 'ham',
    'köttfärs', 'ground meat', 'färs', 'minced', 'entrecôte', 'fläskfilé',
    'kycklingfilé', 'kycklingbröst', 'chicken breast', 'kotlett', 'chop',
    'fisk', 'fish', 'lax', 'salmon', 'torsk', 'cod', 'sej', 'räkor', 'shrimp',
    'räka', 'tonfisk', 'tuna', 'sill', 'herring', 'makrill', 'mackerel',
    'pangasius', 'tilapia', 'rödspätta', 'plaice'
  ];
  if (meatKeywords.some(keyword => name.includes(keyword))) {
    return 'meat';
  }

  // Dairy products
  const dairyKeywords = [
    'mjölk', 'milk', 'yoghurt', 'yogurt', 'grädde', 'cream', 'ost', 'cheese',
    'smör', 'butter', 'kvarg', 'quark', 'crème fraiche', 'créme fraiche',
    'gräddfil', 'sour cream', 'kesella', 'cottage cheese', 'mascarpone',
    'mozzarella', 'parmesan', 'feta', 'ägg', 'egg'
  ];
  if (dairyKeywords.some(keyword => name.includes(keyword))) {
    return 'dairy';
  }

  // Fresh produce
  const freshKeywords = [
    'sallad', 'lettuce', 'tomat', 'tomato', 'gurka', 'cucumber', 'lök', 'onion',
    'vitlök', 'garlic', 'morot', 'carrot', 'paprika', 'pepper', 'potatis', 'potato',
    'banan', 'banana', 'äpple', 'apple', 'citron', 'lemon', 'lime', 'apelsin', 'orange',
    'avokado', 'avocado', 'broccoli', 'blomkål', 'cauliflower', 'zucchini', 'squash',
    'aubergine', 'eggplant', 'spenat', 'spinach', 'ruccola', 'arugula', 'purjolök', 'leek',
    'selleri', 'celery', 'fänkål', 'fennel', 'rödkål', 'red cabbage', 'vitkål', 'cabbage',
    'champinjon', 'mushroom', 'svamp', 'päron', 'pear', 'druvor', 'grape', 'melon',
    'jordgubb', 'strawberry', 'hallon', 'raspberry', 'blåbär', 'blueberry',
    'färsk', 'fresh'
  ];
  if (freshKeywords.some(keyword => name.includes(keyword))) {
    return 'fresh';
  }

  // Frozen
  const frozenKeywords = ['fryst', 'frozen', 'frys'];
  if (frozenKeywords.some(keyword => name.includes(keyword))) {
    return 'frozen';
  }

  // Dry goods / pantry items
  const dryKeywords = [
    'pasta', 'ris', 'rice', 'mjöl', 'flour', 'socker', 'sugar', 'salt', 'peppar',
    'konserv', 'canned', 'burk', 'tomatpuré', 'tomato paste', 'soja', 'soy',
    'olja', 'oil', 'olivolja', 'olive oil', 'vinäger', 'vinegar', 'buljong', 'broth',
    'nudlar', 'noodles', 'couscous', 'quinoa', 'linser', 'lentils', 'bönor', 'beans',
    'kikärtor', 'chickpeas', 'majs', 'corn', 'krossade tomater', 'crushed tomatoes',
    'kokosmjölk', 'coconut milk', 'ströbröd', 'breadcrumbs', 'mandel', 'almond',
    'valnöt', 'walnut', 'hasselnöt', 'hazelnut', 'nötter', 'nuts', 'russin', 'raisins',
    'honung', 'honey', 'sirap', 'syrup', 'senap', 'mustard', 'ketchup', 'majonnäs', 'mayo'
  ];
  if (dryKeywords.some(keyword => name.includes(keyword))) {
    return 'dry';
  }

  return 'unknown';
}

/**
 * Determine if item should be skipped based on suggestion and category
 */
export function shouldSkipItem(
  suggestion: SmartSuggestion | null,
  foodName: string,
  options: PurchaseIntelligenceOptions = {}
): { skip: boolean; reason: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // No history -> always add
  if (!suggestion) {
    return {
      skip: false,
      reason: 'Aldrig använd tidigare - lägg till'
    };
  }

  const { days_since_last_use, frequency_score } = suggestion;
  const category = categorizeFoodItem(foodName);

  // Low frequency items -> don't skip even if recently used
  if (frequency_score < opts.minFrequencyForSkip) {
    return {
      skip: false,
      reason: `Används sällan - lägg till (senast för ${days_since_last_use} dagar sedan)`
    };
  }

  // Apply category-specific thresholds
  let threshold: number;
  let categoryLabel: string;

  switch (category) {
    case 'dairy':
      threshold = opts.dairyDaysThreshold;
      categoryLabel = 'mjölkprodukt';
      break;
    case 'fresh':
      threshold = opts.freshDaysThreshold;
      categoryLabel = 'färskvara';
      break;
    case 'meat':
      threshold = opts.freshDaysThreshold; // Meat is fresh too
      categoryLabel = 'kött/fisk';
      break;
    case 'spices':
      threshold = SPICES_DAYS_THRESHOLD;
      categoryLabel = 'krydda';
      break;
    case 'dry':
      threshold = opts.dryDaysThreshold;
      categoryLabel = 'torrvara';
      break;
    case 'frozen':
      threshold = opts.dryDaysThreshold; // Same as dry goods
      categoryLabel = 'fryst vara';
      break;
    default:
      threshold = 14; // Default 2 weeks for unknown
      categoryLabel = 'vara';
  }

  if (days_since_last_use < threshold) {
    return {
      skip: true,
      reason: `${categoryLabel} använd för ${days_since_last_use} dagar sedan - sannolikt inte slut`
    };
  }

  return {
    skip: false,
    reason: `${categoryLabel} använd för ${days_since_last_use} dagar sedan - troligen slut`
  };
}

/**
 * Generate recommended action for shopping list item
 */
export function getRecommendedAction(
  suggestion: SmartSuggestion | null,
  foodName: string,
  options?: PurchaseIntelligenceOptions
): 'add' | 'skip' | 'maybe' {
  if (!suggestion) {
    return 'add'; // New item -> definitely add
  }

  const category = categorizeFoodItem(foodName);
  const threshold = getThresholdForCategory(category, options);
  const daysSince = suggestion.days_since_last_use;

  // Check if within "maybe" zone (±20% of threshold)
  if (daysSince >= threshold * 0.8 && daysSince <= threshold * 1.2) {
    return 'maybe';
  }

  const { skip } = shouldSkipItem(suggestion, foodName, options);

  if (skip) {
    return 'skip'; // Recently used -> suggest skip
  }

  return 'add';
}

/**
 * Get threshold for food category
 */
function getThresholdForCategory(
  category: FoodCategory,
  options?: PurchaseIntelligenceOptions
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  switch (category) {
    case 'dairy':
      return opts.dairyDaysThreshold;
    case 'fresh':
    case 'meat':
      return opts.freshDaysThreshold;
    case 'spices':
      return SPICES_DAYS_THRESHOLD;
    case 'dry':
    case 'frozen':
      return opts.dryDaysThreshold;
    default:
      return 14;
  }
}

/**
 * Create smart shopping item with intelligence metadata
 */
export function createSmartShoppingItem(
  food: TandoorFood,
  unit: TandoorUnit | undefined,
  amount: number | undefined,
  recipeName: string,
  suggestion: SmartSuggestion | null,
  options?: PurchaseIntelligenceOptions
): SmartShoppingItem {
  const recommendedAction = getRecommendedAction(suggestion, food.name, options);

  return {
    food,
    unit,
    amount,
    recipe_name: recipeName,
    suggestion,
    recommended_action: recommendedAction
  };
}
