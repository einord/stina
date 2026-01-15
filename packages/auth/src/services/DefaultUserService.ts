import type { UserRepository } from '../db/UserRepository.js'
import type { User } from '../types/user.js'
import { AUTH_CONFIG } from '../constants.js'

/**
 * Service for managing the default local user in Electron/TUI mode.
 *
 * In local mode, no authentication is required. Instead, a default
 * user with admin privileges is automatically created and used.
 */
export class DefaultUserService {
  constructor(private userRepository: UserRepository) {}

  /**
   * Ensure the default local user exists.
   * Creates the user if it doesn't exist, otherwise returns the existing user.
   */
  async ensureDefaultUser(): Promise<User> {
    const existingUser = await this.userRepository.getById(AUTH_CONFIG.DEFAULT_USER_ID)

    if (existingUser) {
      return existingUser
    }

    // Create default user with admin privileges
    const user = await this.userRepository.create({
      id: AUTH_CONFIG.DEFAULT_USER_ID,
      username: AUTH_CONFIG.DEFAULT_USERNAME,
      displayName: 'Local User',
      role: 'admin',
    })

    return user
  }

  /**
   * Get the default user ID
   */
  getDefaultUserId(): string {
    return AUTH_CONFIG.DEFAULT_USER_ID
  }

  /**
   * Check if the given user ID is the default user
   */
  isDefaultUser(userId: string): boolean {
    return userId === AUTH_CONFIG.DEFAULT_USER_ID
  }

  /**
   * Get the default user
   */
  async getDefaultUser(): Promise<User | null> {
    return this.userRepository.getById(AUTH_CONFIG.DEFAULT_USER_ID)
  }
}
