# @stina/tandoor

Tandoor Recipe Agent integration for Stina - smart recipe management, meal planning, and intelligent shopping lists.

## Features

### 🧠 Smart Shopping Intelligence
- **Cook History Analysis**: Analyzes Tandoor cook log to build usage patterns
- **Intelligent Suggestions**: Skip items that were recently used based on food category
  - Dairy: 7 days threshold
  - Fresh produce: 3 days threshold
  - Dry goods: 30 days threshold
- **Frequency Scoring**: Tracks how often ingredients are used

### 📊 Food Categorization
Automatic categorization of ingredients:
- **Dairy**: Milk, yogurt, cheese, butter, cream
- **Fresh**: Vegetables, fruits, fresh produce
- **Dry**: Pasta, rice, flour, spices, canned goods
- **Frozen**: Frozen items
- **Unknown**: Fallback for uncategorized items

## Usage

```typescript
import {
  analyzeCookHistory,
  shouldSkipItem,
  createSmartShoppingItem,
  categorizeFoodItem
} from '@stina/tandoor';

// Analyze cook history for an ingredient
const suggestion = analyzeCookHistory(cookLog, { food_name: 'Mjölk' });

// Determine if item should be skipped
const { skip, reason } = shouldSkipItem(suggestion, 'Mjölk');
console.log(skip); // true if recently used
console.log(reason); // "mjölkprodukt använd för 2 dagar sedan - sannolikt inte slut"

// Get food category
const category = categorizeFoodItem('Mjölk'); // 'dairy'
```

## MCP Server Integration

This package works with the external Tandoor MCP server:
- **Server**: [ChristopherJMiller/tandoor-mcp](https://github.com/ChristopherJMiller/tandoor-mcp)
- **Protocol**: MCP via stdio or WebSocket
- **Authentication**: OAuth 2.0 PKCE

See main Stina documentation for MCP server setup instructions.

## API

### Cook History Analysis

#### `analyzeCookHistory(cookLog, ingredient)`
Analyzes cook log to generate smart suggestions for an ingredient.

**Parameters:**
- `cookLog`: Array of `TandoorCookLog` entries
- `ingredient`: Object with `food_name` property

**Returns:** `SmartSuggestion | null`

### Purchase Intelligence

#### `shouldSkipItem(suggestion, foodName, options?)`
Determines if an item should be skipped based on cook history and category.

**Returns:** `{ skip: boolean; reason: string }`

#### `getRecommendedAction(suggestion, foodName, options?)`
Gets recommended action for a shopping list item.

**Returns:** `'add' | 'skip' | 'maybe'`

#### `createSmartShoppingItem(food, unit, amount, recipeName, suggestion, options?)`
Creates a smart shopping item with intelligence metadata.

**Returns:** `SmartShoppingItem`

#### `categorizeFoodItem(foodName)`
Categorizes food item based on name heuristics.

**Returns:** `FoodCategory`

## Configuration Options

```typescript
interface PurchaseIntelligenceOptions {
  dairyDaysThreshold?: number;     // Default: 7
  freshDaysThreshold?: number;     // Default: 3
  dryDaysThreshold?: number;       // Default: 30
  minFrequencyForSkip?: number;    // Default: 0.1
}
```

## Types

All TypeScript types are exported from the main entry point. Key types:

- `TandoorRecipe` - Recipe entity
- `TandoorIngredient` - Ingredient with food, unit, amount
- `TandoorMealPlan` - Meal plan entry
- `TandoorCookLog` - Cook log entry
- `SmartSuggestion` - Shopping suggestion with metadata
- `SmartShoppingItem` - Shopping item with intelligence

See `src/types.ts` for complete type definitions.

## Development

```bash
# Type check
bun run typecheck

# Build
bun run build

# Test
bun test
```

## License

Same as parent Stina project.
