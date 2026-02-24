/**
 * Permission Types
 *
 * Defines all permission types for extensions.
 */

export type Permission =
  | NetworkPermission
  | StoragePermission
  | UserDataPermission
  | CapabilityPermission
  | SystemPermission

/** Network access permissions */
export type NetworkPermission =
  | 'network:*'
  | `network:localhost`
  | `network:localhost:${number}`
  | `network:${string}`

/** Storage permissions */
export type StoragePermission = 'storage.collections' | 'secrets.manage'

/** User data permissions */
export type UserDataPermission =
  | 'user.profile.read'
  | 'user.list'
  | 'user.location.read'
  | 'chat.history.read'
  | 'chat.current.read'

/** Capability permissions */
export type CapabilityPermission =
  | 'provider.register'
  | 'tools.register'
  | 'tools.list'
  | 'tools.execute'
  | 'actions.register'
  | 'settings.register'
  | 'commands.register'
  | 'panels.register'
  | 'events.emit'
  | 'scheduler.register'
  | 'chat.message.write'
  | 'background.workers'

/** System permissions */
export type SystemPermission =
  | 'files.read'
  | 'files.write'
  | 'clipboard.read'
  | 'clipboard.write'
