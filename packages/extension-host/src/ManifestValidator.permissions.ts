/**
 * Permission Validation
 *
 * Validates extension permission strings against allowed patterns.
 */

/**
 * Valid permission patterns (exact matches)
 */
export const VALID_PERMISSIONS = new Set([
  'network:*',
  'network:localhost',
  'database.own',
  'storage.local',
  'user.profile.read',
  'user.location.read',
  'chat.history.read',
  'chat.current.read',
  'chat.message.write',
  'provider.register',
  'tools.register',
  'actions.register',
  'settings.register',
  'commands.register',
  'panels.register',
  'events.emit',
  'scheduler.register',
  'files.read',
  'files.write',
  'clipboard.read',
  'clipboard.write',
])

/**
 * Permission patterns that match dynamically
 */
export const PERMISSION_PATTERNS = [
  /^network:localhost:\d+$/, // network:localhost:11434
  /^network:[a-zA-Z0-9.-]+$/, // network:api.example.com
  /^network:[a-zA-Z0-9.-]+:\d+$/, // network:api.example.com:8080
]

/**
 * Check if a permission string is valid
 * @param permission The permission to validate
 * @returns true if the permission is valid
 */
export function isValidPermission(permission: string): boolean {
  if (VALID_PERMISSIONS.has(permission)) {
    return true
  }

  for (const pattern of PERMISSION_PATTERNS) {
    if (pattern.test(permission)) {
      return true
    }
  }

  return false
}
