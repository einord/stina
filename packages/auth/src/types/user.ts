/**
 * User roles in the system
 */
export type UserRole = 'admin' | 'user'

/**
 * User entity
 */
export interface User {
  id: string
  username: string
  displayName: string | null
  role: UserRole
  createdAt: Date
  updatedAt: Date
  lastLoginAt: Date | null
}

/**
 * User creation input
 */
export interface CreateUserInput {
  id?: string
  username: string
  displayName?: string
  role?: UserRole
}

/**
 * User update input
 */
export interface UpdateUserInput {
  displayName?: string
  role?: UserRole
}
