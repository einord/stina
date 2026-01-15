import type { UserRepository } from '../db/UserRepository.js'
import type { PasskeyCredentialRepository } from '../db/PasskeyCredentialRepository.js'
import type { RefreshTokenRepository } from '../db/RefreshTokenRepository.js'
import type { AuthConfigRepository } from '../db/AuthConfigRepository.js'
import type { InvitationRepository, Invitation } from '../db/InvitationRepository.js'
import type { User, UserRole } from '../types/user.js'
import type { TokenPair, DeviceInfo } from '../types/session.js'
import { TokenService } from './TokenService.js'
import type { RegistrationResult, AuthenticationResult } from './PasskeyService.js'
import { PasskeyService } from './PasskeyService.js'
import { nanoid } from 'nanoid'

/**
 * Challenge store entry
 */
interface ChallengeEntry {
  challenge: string
  userId?: string
  username?: string
  expiresAt: Date
}

/**
 * Registration options input
 */
export interface RegistrationOptionsInput {
  username: string
  displayName?: string
  /** Invitation token for non-first users */
  invitationToken?: string
}

/**
 * Registration verification input
 */
export interface RegistrationVerifyInput {
  username: string
  /** WebAuthn RegistrationResponseJSON from the browser */
  credential: unknown
  invitationToken?: string
}

/**
 * Authentication options input
 */
export interface AuthenticationOptionsInput {
  username?: string
}

/**
 * Authentication verification input
 */
export interface AuthenticationVerifyInput {
  /** WebAuthn AuthenticationResponseJSON from the browser */
  credential: unknown
  deviceInfo?: DeviceInfo
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean
  user?: User
  tokens?: TokenPair
  error?: string
}

/**
 * Create invitation input
 */
export interface CreateInvitationInput {
  username: string
  role?: UserRole
}

/**
 * Main authentication service that orchestrates all auth operations
 */
export class AuthService {
  private challengeStore: Map<string, ChallengeEntry> = new Map()

  constructor(
    private userRepository: UserRepository,
    private passkeyCredentialRepository: PasskeyCredentialRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private authConfigRepository: AuthConfigRepository,
    private invitationRepository: InvitationRepository,
    private tokenService: TokenService,
    private passkeyService: PasskeyService
  ) {}

  // ========================================
  // Setup & Configuration
  // ========================================

  /**
   * Check if this is the first user (no users exist)
   */
  async isFirstUser(): Promise<boolean> {
    return this.userRepository.isEmpty()
  }

  /**
   * Check if setup has been completed
   */
  async isSetupCompleted(): Promise<boolean> {
    return this.authConfigRepository.isSetupCompleted()
  }

  /**
   * Complete initial setup with RP configuration
   */
  async completeSetup(rpId: string, rpOrigin: string): Promise<void> {
    await this.authConfigRepository.setRpId(rpId)
    await this.authConfigRepository.setRpOrigin(rpOrigin)
    await this.authConfigRepository.markSetupCompleted()

    // Update the passkey service with new config
    this.passkeyService.updateConfig({
      rpId,
      origin: rpOrigin,
    })
  }

  // ========================================
  // Registration
  // ========================================

  /**
   * Generate registration options for a new user
   */
  async generateRegistrationOptions(
    input: RegistrationOptionsInput
  ): Promise<{ options: unknown; isFirstUser: boolean }> {
    const isFirstUser = await this.isFirstUser()

    // If not first user, require invitation
    if (!isFirstUser && !input.invitationToken) {
      throw new Error('Invitation token required for registration')
    }

    // Validate invitation if provided
    if (input.invitationToken) {
      const invitation = await this.invitationRepository.getValidByToken(input.invitationToken)
      if (!invitation) {
        throw new Error('Invalid or expired invitation')
      }
      // Username must match invitation
      if (invitation.username !== input.username) {
        throw new Error('Username does not match invitation')
      }
    }

    // Check if username is already taken
    const existingUser = await this.userRepository.getByUsername(input.username)
    if (existingUser) {
      throw new Error('Username already exists')
    }

    // Generate a temporary user ID for the registration process
    const tempUserId = nanoid()

    const options = await this.passkeyService.generateRegistrationOptions(
      {
        id: tempUserId,
        username: input.username,
        displayName: input.displayName,
      },
      []
    )

    // Store challenge for verification (options contains a challenge property)
    const optionsObj = options as { challenge: string }
    this.storeChallenge(optionsObj.challenge, {
      userId: tempUserId,
      username: input.username,
    })

    return { options, isFirstUser }
  }

  /**
   * Verify registration and create user
   */
  async verifyRegistration(input: RegistrationVerifyInput): Promise<AuthResult> {
    // Cast credential to access its properties
    const credentialInput = input.credential as { response: { clientDataJSON: string; transports?: string[] } }

    // Get stored challenge
    const challengeEntry = this.getChallenge(credentialInput.response.clientDataJSON)
    if (!challengeEntry) {
      return { success: false, error: 'Challenge expired or not found' }
    }

    // Verify the registration response
    let verification: RegistrationResult
    try {
      verification = await this.passkeyService.verifyRegistration(
        challengeEntry.challenge,
        input.credential
      )
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      }
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { success: false, error: 'Registration verification failed' }
    }

    // Determine role (first user is admin, otherwise from invitation)
    const isFirstUser = await this.isFirstUser()
    let role: UserRole = 'user'
    let invitation: Invitation | null = null

    if (isFirstUser) {
      role = 'admin'
    } else if (input.invitationToken) {
      invitation = await this.invitationRepository.getValidByToken(input.invitationToken)
      if (!invitation) {
        return { success: false, error: 'Invalid or expired invitation' }
      }
      role = invitation.role
    }

    // Create user
    const user = await this.userRepository.create({
      username: input.username,
      role,
    })

    // Store passkey credential
    const registeredCredential = verification.registrationInfo.credential
    // Use transports from the input credential response
    const transports = credentialInput.response.transports

    await this.passkeyCredentialRepository.create({
      userId: user.id,
      // RegistrationResult already returns base64url strings
      credentialId: registeredCredential.id,
      publicKey: registeredCredential.publicKey,
      counter: registeredCredential.counter,
      transports,
      deviceType: verification.registrationInfo.credentialDeviceType,
      backedUp: verification.registrationInfo.credentialBackedUp,
    })

    // Mark invitation as used if applicable
    if (invitation) {
      await this.invitationRepository.markUsed(invitation.id, user.id)
    }

    // Generate tokens
    const { tokens, refreshTokenData } = await this.tokenService.generateTokenPair(user)

    // Store refresh token
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: refreshTokenData.tokenHash,
      expiresAt: refreshTokenData.expiresAt,
    })

    // Update last login
    await this.userRepository.updateLastLogin(user.id)

    // Clear challenge
    this.clearChallenge(challengeEntry.challenge)

    return { success: true, user, tokens }
  }

  // ========================================
  // Authentication
  // ========================================

  /**
   * Generate authentication options for login
   */
  async generateAuthenticationOptions(input: AuthenticationOptionsInput): Promise<unknown> {
    let allowCredentials

    // If username provided, limit to that user's credentials
    if (input.username) {
      const user = await this.userRepository.getByUsername(input.username)
      if (user) {
        const credentials = await this.passkeyCredentialRepository.getByUserId(user.id)
        allowCredentials = credentials.map((c) => ({
          credentialId: c.credentialId,
          transports: c.transports as AuthenticatorTransport[] | undefined,
        }))
      }
    }

    const options = await this.passkeyService.generateAuthenticationOptions(allowCredentials)

    // Store challenge (options contains a challenge property)
    const optionsObj = options as { challenge: string }
    this.storeChallenge(optionsObj.challenge)

    return options
  }

  /**
   * Verify authentication and issue tokens
   */
  async verifyAuthentication(input: AuthenticationVerifyInput): Promise<AuthResult> {
    // Cast credential to access its properties
    const credential = input.credential as {
      id: string
      response: { clientDataJSON: string }
    }

    // Get stored challenge
    const challengeEntry = this.getChallenge(credential.response.clientDataJSON)
    if (!challengeEntry) {
      return { success: false, error: 'Challenge expired or not found' }
    }

    // Find the credential
    const storedCredential = await this.passkeyCredentialRepository.getByCredentialId(credential.id)
    if (!storedCredential) {
      return { success: false, error: 'Credential not found' }
    }

    // Get the user
    const user = await this.userRepository.getById(storedCredential.userId)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Verify the authentication response
    let verification: AuthenticationResult
    try {
      verification = await this.passkeyService.verifyAuthentication(
        challengeEntry.challenge,
        input.credential,
        {
          credentialId: storedCredential.credentialId,
          publicKey: storedCredential.publicKey,
          counter: storedCredential.counter,
          transports: storedCredential.transports as AuthenticatorTransport[] | undefined,
        }
      )
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      }
    }

    if (!verification.verified) {
      return { success: false, error: 'Authentication verification failed' }
    }

    // Update credential counter
    await this.passkeyCredentialRepository.updateCounter(
      storedCredential.id,
      verification.authenticationInfo.newCounter
    )

    // Generate tokens
    const { tokens, refreshTokenData } = await this.tokenService.generateTokenPair(user)

    // Store refresh token
    await this.refreshTokenRepository.create({
      userId: user.id,
      tokenHash: refreshTokenData.tokenHash,
      expiresAt: refreshTokenData.expiresAt,
      deviceInfo: input.deviceInfo,
    })

    // Update last login
    await this.userRepository.updateLastLogin(user.id)

    // Clear challenge
    this.clearChallenge(challengeEntry.challenge)

    return { success: true, user, tokens }
  }

  // ========================================
  // Token Management
  // ========================================

  /**
   * Verify an access token and return the payload
   */
  async verifyAccessToken(token: string): Promise<{ sub: string; username: string; role: UserRole }> {
    return this.tokenService.verifyAccessToken(token)
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    // Verify the refresh token JWT
    let payload
    try {
      payload = await this.tokenService.verifyRefreshToken(refreshToken)
    } catch {
      return { success: false, error: 'Invalid refresh token' }
    }

    // Check if token is stored and not revoked
    const tokenHash = this.tokenService.hashToken(refreshToken)
    const storedToken = await this.refreshTokenRepository.getValidByTokenHash(tokenHash)
    if (!storedToken) {
      return { success: false, error: 'Refresh token revoked or expired' }
    }

    // Get the user
    const user = await this.userRepository.getById(payload.sub)
    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Generate new access token only (keep the same refresh token)
    const accessToken = await this.tokenService.generateAccessToken(user)

    return {
      success: true,
      user,
      tokens: {
        accessToken,
        refreshToken, // Return the same refresh token
      },
    }
  }

  /**
   * Revoke a refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(refreshToken)
    await this.refreshTokenRepository.revokeByTokenHash(tokenHash)
  }

  /**
   * Revoke all refresh tokens for a user (logout everywhere)
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.revokeAllByUserId(userId)
  }

  // ========================================
  // User Management
  // ========================================

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.getById(id)
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    return this.userRepository.getByUsername(username)
  }

  /**
   * List all users
   */
  async listUsers(): Promise<User[]> {
    return this.userRepository.list()
  }

  /**
   * Update user role
   */
  async updateUserRole(id: string, role: UserRole): Promise<User | null> {
    return this.userRepository.update(id, { role })
  }

  /**
   * Delete a user and all their data
   */
  async deleteUser(id: string): Promise<void> {
    // Revoke all tokens first
    await this.refreshTokenRepository.revokeAllByUserId(id)
    // Delete user (cascades to credentials)
    await this.userRepository.delete(id)
  }

  // ========================================
  // Invitation Management
  // ========================================

  /**
   * Create an invitation for a new user
   */
  async createInvitation(createdBy: string, input: CreateInvitationInput): Promise<Invitation> {
    // Check if username is already taken
    const existingUser = await this.userRepository.getByUsername(input.username)
    if (existingUser) {
      throw new Error('Username already exists')
    }

    return this.invitationRepository.create({
      username: input.username,
      role: input.role,
      createdBy,
    })
  }

  /**
   * Get all pending invitations
   */
  async getPendingInvitations(): Promise<Invitation[]> {
    return this.invitationRepository.getPending()
  }

  /**
   * Get invitation by token
   */
  async getInvitationByToken(token: string): Promise<Invitation | null> {
    return this.invitationRepository.getValidByToken(token)
  }

  /**
   * Delete an invitation
   */
  async deleteInvitation(id: string): Promise<void> {
    return this.invitationRepository.delete(id)
  }

  // ========================================
  // Challenge Management (Private)
  // ========================================

  private storeChallenge(
    challenge: string,
    metadata?: { userId?: string; username?: string }
  ): void {
    // Challenges expire after 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    this.challengeStore.set(challenge, {
      challenge,
      userId: metadata?.userId,
      username: metadata?.username,
      expiresAt,
    })

    // Cleanup old challenges
    this.cleanupChallenges()
  }

  private getChallenge(clientDataJSON: string): ChallengeEntry | null {
    // Extract challenge from clientDataJSON
    try {
      const clientData = JSON.parse(atob(clientDataJSON)) as { challenge: string }
      const challenge = clientData.challenge

      const entry = this.challengeStore.get(challenge)
      if (!entry) return null

      // Check if expired
      if (entry.expiresAt < new Date()) {
        this.challengeStore.delete(challenge)
        return null
      }

      return entry
    } catch {
      return null
    }
  }

  private clearChallenge(challenge: string): void {
    this.challengeStore.delete(challenge)
  }

  private cleanupChallenges(): void {
    const now = new Date()
    for (const [key, entry] of this.challengeStore) {
      if (entry.expiresAt < now) {
        this.challengeStore.delete(key)
      }
    }
  }
}
