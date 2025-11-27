/**
 * Tandoor Recipe Agent - Cook History Analysis
 *
 * Analyzes Tandoor cook log to build usage patterns for ingredients.
 */

import type { TandoorCookLog, TandoorIngredient, SmartSuggestion } from './types.js';

/**
 * Analyze cook log to generate smart suggestions for ingredients
 */
export function analyzeCookHistory(
  cookLog: TandoorCookLog[],
  ingredient: { food_name: string }
): SmartSuggestion | null {
  // Find all cook log entries that used this ingredient
  const relevantEntries = cookLog.filter(entry =>
    entry.recipe.steps?.some(step =>
      step.ingredients?.some(ing =>
        ing.food.name.toLowerCase() === ingredient.food_name.toLowerCase()
      )
    )
  );

  if (relevantEntries.length === 0) {
    return null; // No history for this ingredient
  }

  // Sort by date (most recent first)
  relevantEntries.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const mostRecentEntry = relevantEntries[0];
  const lastUsedTimestamp = new Date(mostRecentEntry.created_at).getTime();
  const now = Date.now();
  const daysSinceLastUse = Math.floor((now - lastUsedTimestamp) / (1000 * 60 * 60 * 24));

  // Calculate frequency score (how often this ingredient is used)
  // Simple heuristic: number of times used in last 60 days / 60
  const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);
  const recentUsageCount = relevantEntries.filter(entry =>
    new Date(entry.created_at).getTime() > sixtyDaysAgo
  ).length;
  const frequencyScore = Math.min(recentUsageCount / 60, 1.0);

  return {
    food_name: ingredient.food_name,
    last_used_in_recipe: lastUsedTimestamp,
    frequency_score: frequencyScore,
    days_since_last_use: daysSinceLastUse,
    suggest_skip: false, // Will be determined by purchase-intelligence.ts
    reason: `Used ${relevantEntries.length} times, last in "${mostRecentEntry.recipe.name}" ${daysSinceLastUse} days ago`
  };
}

