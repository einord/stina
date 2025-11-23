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

/**
 * Get all unique ingredients from cook log
 */
export function extractIngredientsFromCookLog(cookLog: TandoorCookLog[]): string[] {
  const ingredientSet = new Set<string>();

  for (const entry of cookLog) {
    if (entry.recipe.steps) {
      for (const step of entry.recipe.steps) {
        if (step.ingredients) {
          for (const ingredient of step.ingredients) {
            ingredientSet.add(ingredient.food.name);
          }
        }
      }
    }
  }

  return Array.from(ingredientSet);
}

/**
 * Calculate average days between uses for an ingredient
 */
export function calculateAverageUsageInterval(
  cookLog: TandoorCookLog[],
  foodName: string
): number | null {
  const relevantEntries = cookLog
    .filter(entry =>
      entry.recipe.steps?.some(step =>
        step.ingredients?.some(ing =>
          ing.food.name.toLowerCase() === foodName.toLowerCase()
        )
      )
    )
    .sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  if (relevantEntries.length < 2) {
    return null; // Need at least 2 entries to calculate interval
  }

  const intervals: number[] = [];
  for (let i = 1; i < relevantEntries.length; i++) {
    const prevTimestamp = new Date(relevantEntries[i - 1].created_at).getTime();
    const currTimestamp = new Date(relevantEntries[i].created_at).getTime();
    const daysBetween = (currTimestamp - prevTimestamp) / (1000 * 60 * 60 * 24);
    intervals.push(daysBetween);
  }

  const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  return Math.round(avgInterval);
}
