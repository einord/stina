/**
 * Permission Schema
 *
 * Zod schema for extension permission strings.
 * Generates both TypeScript types and JSON Schema.
 */

import { z } from 'zod'

/**
 * Valid exact permission values
 */
export const VALID_PERMISSIONS = [
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
  'background.workers',
  'files.read',
  'files.write',
  'clipboard.read',
  'clipboard.write',
] as const

/**
 * Permission patterns for dynamic permissions (network with host/port)
 */
export const PERMISSION_PATTERNS = [
  /^network:localhost:\d+$/, // network:localhost:11434
  /^network:[a-zA-Z0-9.-]+$/, // network:api.example.com
  /^network:[a-zA-Z0-9.-]+:\d+$/, // network:api.example.com:8080
]

/**
 * Network permission schema - matches exact values and patterns
 */
const NetworkPermissionSchema = z
  .string()
  .refine(
    (val) => {
      // Check exact matches first
      if (val === 'network:*' || val === 'network:localhost') {
        return true
      }
      // Check dynamic patterns
      return PERMISSION_PATTERNS.some((pattern) => pattern.test(val))
    },
    { message: 'Invalid network permission format' }
  )
  .describe('Network access permission (e.g., "network:*", "network:localhost:11434")')

/**
 * Storage permission schema
 */
const StoragePermissionSchema = z.enum(['database.own', 'storage.local']).describe('Storage permission')

/**
 * User data permission schema
 */
const UserDataPermissionSchema = z
  .enum(['user.profile.read', 'user.location.read', 'chat.history.read', 'chat.current.read'])
  .describe('User data access permission')

/**
 * Capability permission schema
 */
const CapabilityPermissionSchema = z
  .enum([
    'provider.register',
    'tools.register',
    'actions.register',
    'settings.register',
    'commands.register',
    'panels.register',
    'events.emit',
    'scheduler.register',
    'chat.message.write',
    'background.workers',
  ])
  .describe('Capability permission')

/**
 * System permission schema
 */
const SystemPermissionSchema = z
  .enum(['files.read', 'files.write', 'clipboard.read', 'clipboard.write'])
  .describe('System permission')

/**
 * Regex pattern for dynamic network permissions (host with optional port)
 * Matches: network:api.example.com, network:localhost:11434, network:api.example.com:8080
 */
const NETWORK_PERMISSION_REGEX = /^network:[a-zA-Z0-9.-]+(:\d+)?$/

/**
 * Combined permission schema - validates against all permission types
 * Uses z.union with z.enum and z.string().regex() for better JSON Schema generation
 */
export const PermissionSchema = z
  .union([
    z.enum(VALID_PERMISSIONS),
    z.string().regex(NETWORK_PERMISSION_REGEX, 'Invalid network permission format'),
  ])
  .describe('Extension permission')

/**
 * Check if a permission string is valid
 */
export function isValidPermission(permission: string): boolean {
  return PermissionSchema.safeParse(permission).success
}

// Re-export individual schemas for more specific validation if needed
export {
  NetworkPermissionSchema,
  StoragePermissionSchema,
  UserDataPermissionSchema,
  CapabilityPermissionSchema,
  SystemPermissionSchema,
}

// Type exports
export type Permission = z.infer<typeof PermissionSchema>
export type NetworkPermission = 'network:*' | `network:localhost` | `network:localhost:${number}` | `network:${string}`
export type StoragePermission = z.infer<typeof StoragePermissionSchema>
export type UserDataPermission = z.infer<typeof UserDataPermissionSchema>
export type CapabilityPermission = z.infer<typeof CapabilityPermissionSchema>
export type SystemPermission = z.infer<typeof SystemPermissionSchema>
