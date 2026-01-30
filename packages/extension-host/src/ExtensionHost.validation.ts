/**
 * Extension Host Validation Utilities
 *
 * Common validation functions shared across extension host handlers.
 */

/**
 * Validates that a userId has a valid format.
 *
 * @param userId - The user ID to validate
 * @throws Error if userId is empty or contains invalid characters
 */
export function validateUserId(userId: string): void {
  if (!userId || userId.length === 0) {
    throw new Error('userId cannot be empty')
  }
  if (userId.includes(':') || userId.includes('/') || userId.includes('\\')) {
    throw new Error('userId contains invalid characters')
  }
}
