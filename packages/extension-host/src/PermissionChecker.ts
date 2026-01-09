/**
 * Permission Checker
 *
 * Validates that extension requests are allowed based on declared permissions.
 */

import type { Permission } from '@stina/extension-api'

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Checks if an extension has the required permissions for an operation
 */
export class PermissionChecker {
  private readonly permissions: Set<string>

  constructor(permissions: Permission[]) {
    this.permissions = new Set(permissions)
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
   * Validate SQL to ensure it only accesses the extension's prefixed tables
   */
  validateSQL(extensionId: string, sql: string): PermissionCheckResult {
    const prefix = `ext_${extensionId.replace(/-/g, '_')}_`

    // Simple table name extraction (not a full SQL parser, but catches common cases)
    const tablePatterns = [
      /\bFROM\s+(\w+)/gi,
      /\bINTO\s+(\w+)/gi,
      /\bUPDATE\s+(\w+)/gi,
      /\bTABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(\w+)/gi,
      /\bJOIN\s+(\w+)/gi,
    ]

    const tables = new Set<string>()
    for (const pattern of tablePatterns) {
      let match
      while ((match = pattern.exec(sql)) !== null) {
        const tableName = match[1]
        if (tableName) {
          tables.add(tableName.toLowerCase())
        }
      }
    }

    for (const table of tables) {
      if (!table.startsWith(prefix.toLowerCase())) {
        return {
          allowed: false,
          reason: `Access to table "${table}" not allowed. Extension tables must be prefixed with "${prefix}"`,
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Get a list of all granted permissions
   */
  getPermissions(): string[] {
    return Array.from(this.permissions)
  }
}
