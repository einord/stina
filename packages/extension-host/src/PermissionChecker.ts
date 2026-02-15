/**
 * Permission Checker
 *
 * Validates that extension requests are allowed based on declared permissions.
 */

import type { Permission, StorageContributions } from '@stina/extension-api'

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Options for creating a PermissionChecker
 */
export interface PermissionCheckerOptions {
  /** The permissions granted to the extension */
  permissions: Permission[]
  /** Storage contributions from the manifest (optional, for collection validation) */
  storageContributions?: StorageContributions
}

/**
 * Checks if an extension has the required permissions for an operation
 */
export class PermissionChecker {
  private readonly permissions: Set<string>
  private readonly declaredCollections: Set<string>

  constructor(permissions: Permission[])
  constructor(options: PermissionCheckerOptions)
  constructor(permissionsOrOptions: Permission[] | PermissionCheckerOptions) {
    if (Array.isArray(permissionsOrOptions)) {
      // Legacy constructor for backwards compatibility
      this.permissions = new Set(permissionsOrOptions)
      this.declaredCollections = new Set()
    } else {
      this.permissions = new Set(permissionsOrOptions.permissions)
      // Extract declared collection names from storage contributions
      this.declaredCollections = new Set(
        permissionsOrOptions.storageContributions?.collections
          ? Object.keys(permissionsOrOptions.storageContributions.collections)
          : []
      )
    }
  }

  /**
   * Check if the extension has a specific permission
   */
  hasPermission(permission: string): boolean {
    // Direct match
    if (this.permissions.has(permission)) {
      return true
    }

    // Wildcard match (e.g., "network:*" matches "network:localhost")
    for (const perm of this.permissions) {
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -1) // Remove the '*'
        if (permission.startsWith(prefix)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if a network request is allowed
   */
  checkNetworkAccess(url: string): PermissionCheckResult {
    try {
      const parsed = new URL(url)
      const host = parsed.hostname
      const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')

      // Check for wildcard network access
      if (this.hasPermission('network:*')) {
        return { allowed: true }
      }

      // Check for localhost access
      if (host === 'localhost' || host === '127.0.0.1') {
        if (this.hasPermission('network:localhost')) {
          return { allowed: true }
        }
        if (this.hasPermission(`network:localhost:${port}`)) {
          return { allowed: true }
        }
      }

      // Check for specific domain access
      if (this.hasPermission(`network:${host}`)) {
        return { allowed: true }
      }
      if (this.hasPermission(`network:${host}:${port}`)) {
        return { allowed: true }
      }

      return {
        allowed: false,
        reason: `Network access to ${host}:${port} not allowed. Required permission: network:${host}:${port}`,
      }
    } catch {
      return {
        allowed: false,
        reason: `Invalid URL: ${url}`,
      }
    }
  }

  /**
   * Check if database access is allowed
   * @deprecated Use checkStorageCollectionsAccess() instead. Will be removed in a future version.
   */
  checkDatabaseAccess(): PermissionCheckResult {
    if (this.hasPermission('database.own')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Database access not allowed. Required permission: database.own',
    }
  }

  /**
   * Check if storage access is allowed
   * @deprecated Use checkStorageCollectionsAccess() instead. Will be removed in a future version.
   */
  checkStorageAccess(): PermissionCheckResult {
    if (this.hasPermission('storage.local')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Storage access not allowed. Required permission: storage.local',
    }
  }

  /**
   * Check if storage collections access is allowed (new storage system)
   */
  checkStorageCollectionsAccess(): PermissionCheckResult {
    if (this.hasPermission('storage.collections')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Storage collections access not allowed. Required permission: storage.collections',
    }
  }

  /**
   * Check if secrets access is allowed
   */
  checkSecretsAccess(): PermissionCheckResult {
    if (this.hasPermission('secrets.manage')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Secrets access not allowed. Required permission: secrets.manage',
    }
  }

  /**
   * Validate that a collection is declared in the extension's manifest.
   * Extensions can only access collections they have declared in contributes.storage.collections.
   *
   * @param _extensionId - The extension ID (reserved for future use)
   * @param collection - The collection name to validate
   */
  validateCollectionAccess(_extensionId: string, collection: string): PermissionCheckResult {
    // Require explicit collection declarations to prevent unrestricted access
    if (this.declaredCollections.size === 0) {
      return {
        allowed: false,
        reason:
          `No storage collections declared in manifest. Declare collection "${collection}" in contributes.storage.collections.`,
      }
    }

    if (this.declaredCollections.has(collection)) {
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: `Collection "${collection}" not declared in manifest. Add it to contributes.storage.collections.`,
    }
  }

  /**
   * Check if settings access is allowed
   */
  checkSettingsAccess(): PermissionCheckResult {
    if (this.hasPermission('settings.register')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Settings access not allowed. Required permission: settings.register',
    }
  }

  /**
   * Check if user profile read access is allowed
   */
  checkUserProfileRead(): PermissionCheckResult {
    if (this.hasPermission('user.profile.read')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'User profile access not allowed. Required permission: user.profile.read',
    }
  }

  /**
   * Check if provider registration is allowed
   */
  checkProviderRegistration(): PermissionCheckResult {
    if (this.hasPermission('provider.register')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Provider registration not allowed. Required permission: provider.register',
    }
  }

  /**
   * Check if tool registration is allowed
   */
  checkToolRegistration(): PermissionCheckResult {
    if (this.hasPermission('tools.register')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Tool registration not allowed. Required permission: tools.register',
    }
  }

  /**
   * Check if tool listing is allowed
   */
  checkToolListAccess(): PermissionCheckResult {
    if (this.hasPermission('tools.list')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Tool listing not allowed. Required permission: tools.list',
    }
  }

  /**
   * Check if tool execution is allowed
   */
  checkToolExecuteAccess(): PermissionCheckResult {
    if (this.hasPermission('tools.execute')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Tool execution not allowed. Required permission: tools.execute',
    }
  }

  /**
   * Check if action registration is allowed
   */
  checkActionRegistration(): PermissionCheckResult {
    if (this.hasPermission('actions.register')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Action registration not allowed. Required permission: actions.register',
    }
  }

  /**
   * Check if event emission is allowed
   */
  checkEventsEmit(): PermissionCheckResult {
    if (this.hasPermission('events.emit')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Event emission not allowed. Required permission: events.emit',
    }
  }

  /**
   * Check if scheduler access is allowed
   */
  checkSchedulerAccess(): PermissionCheckResult {
    if (this.hasPermission('scheduler.register')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Scheduler access not allowed. Required permission: scheduler.register',
    }
  }

  /**
   * Check if chat message write is allowed
   */
  checkChatMessageWrite(): PermissionCheckResult {
    if (this.hasPermission('chat.message.write')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Chat message write not allowed. Required permission: chat.message.write',
    }
  }

  /**
   * Check if background workers access is allowed
   */
  checkBackgroundWorkersAccess(): PermissionCheckResult {
    if (this.hasPermission('background.workers')) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Background workers access not allowed. Required permission: background.workers',
    }
  }

  /**
   * Get a list of all granted permissions
   */
  getPermissions(): string[] {
    return Array.from(this.permissions)
  }

  /**
   * Get a list of all declared collections
   */
  getDeclaredCollections(): string[] {
    return Array.from(this.declaredCollections)
  }
}
