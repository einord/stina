import { createHash, randomBytes } from 'node:crypto'
import type { TokenPair } from '../types/session.js'
import type { TokenService, GeneratedRefreshToken } from './TokenService.js'
import type { UserRepository } from '../db/UserRepository.js'
import type { RefreshTokenRepository } from '../db/RefreshTokenRepository.js'

/**
 * PKCE session for Electron authentication flow
 */
export interface ElectronAuthSession {
  /** Unique session identifier */
  id: string
  /** SHA-256 hash of the code verifier (for PKCE verification) */
  codeChallenge: string
  /** CSRF protection state parameter */
  state: string
  /** When this session expires */
  expiresAt: Date
  /** Authorization code (set after successful WebAuthn) */
  authCode?: string
  /** When the auth code expires */
  authCodeExpiresAt?: Date
  /** User ID (set after successful WebAuthn) */
  userId?: string
  /** Session status for polling */
  status: 'pending' | 'completed' | 'error'
  /** Error message if status is 'error' */
  error?: string
}

/**
 * Configuration for ElectronAuthService
 */
export interface ElectronAuthServiceConfig {
  /** How long sessions are valid (ms). Default: 5 minutes */
  sessionTtlMs?: number
  /** How long auth codes are valid (ms). Default: 60 seconds */
  authCodeTtlMs?: number
}

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_AUTH_CODE_TTL_MS = 60 * 1000 // 60 seconds

/**
 * Service for handling Electron's external browser authentication flow.
 * Implements PKCE (Proof Key for Code Exchange) for secure token exchange.
 *
 * Flow:
 * 1. Electron generates code_verifier and code_challenge
 * 2. Electron opens browser with code_challenge
 * 3. User completes WebAuthn in browser
 * 4. Server generates auth_code and redirects to stina://callback
 * 5. Electron exchanges auth_code + code_verifier for tokens
 */
export class ElectronAuthService {
  private sessions: Map<string, ElectronAuthSession> = new Map()
  private sessionTtlMs: number
  private authCodeTtlMs: number

  constructor(
    private readonly tokenService: TokenService,
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    config?: ElectronAuthServiceConfig
  ) {
    this.sessionTtlMs = config?.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS
    this.authCodeTtlMs = config?.authCodeTtlMs ?? DEFAULT_AUTH_CODE_TTL_MS

    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 60 * 1000)
  }

  /**
   * Create a new authentication session for PKCE flow.
   * Called when Electron initiates the auth flow.
   *
   * @param codeChallenge - SHA-256 hash of the code_verifier (base64url encoded)
   * @param state - CSRF protection state parameter
   * @returns Session ID to include in the browser login URL
   */
  createSession(codeChallenge: string, state: string): string {
    const sessionId = randomBytes(16).toString('hex')

    const session: ElectronAuthSession = {
      id: sessionId,
      codeChallenge,
      state,
      expiresAt: new Date(Date.now() + this.sessionTtlMs),
      status: 'pending',
    }

    this.sessions.set(sessionId, session)
    return sessionId
  }

  /**
   * Get a session by ID.
   * Used by the browser login page to verify the session exists.
   */
  getSession(sessionId: string): ElectronAuthSession | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    // Check if expired
    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId)
      return null
    }

    return session
  }

  /**
   * Complete authentication after successful WebAuthn.
   * Generates an authorization code to return to Electron.
   *
   * @param sessionId - The session ID from the login URL
   * @param userId - The authenticated user's ID
   * @returns Authorization code to redirect to Electron
   */
  completeAuthentication(sessionId: string, userId: string): string {
    const session = this.sessions.get(sessionId)

    if (!session) {
      throw new Error('Session not found or expired')
    }

    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId)
      throw new Error('Session expired')
    }

    if (session.status !== 'pending') {
      throw new Error('Session already completed or errored')
    }

    // Generate authorization code
    const authCode = randomBytes(32).toString('hex')

    // Update session
    session.authCode = authCode
    session.authCodeExpiresAt = new Date(Date.now() + this.authCodeTtlMs)
    session.userId = userId
    session.status = 'completed'

    return authCode
  }

  /**
   * Mark a session as errored.
   * Used when WebAuthn fails in the browser.
   */
  markSessionError(sessionId: string, error: string): void {
    const session = this.sessions.get(sessionId)
    if (session && session.status === 'pending') {
      session.status = 'error'
      session.error = error
    }
  }

  /**
   * Get session status for polling.
   * Electron can poll this endpoint as a fallback if custom protocol doesn't work.
   */
  getSessionStatus(sessionId: string): {
    status: 'pending' | 'completed' | 'error' | 'not_found'
    code?: string
    state?: string
    error?: string
  } {
    const session = this.sessions.get(sessionId)

    if (!session || session.expiresAt < new Date()) {
      return { status: 'not_found' }
    }

    if (session.status === 'completed' && session.authCode) {
      return {
        status: 'completed',
        code: session.authCode,
        state: session.state,
      }
    }

    if (session.status === 'error') {
      return {
        status: 'error',
        error: session.error,
      }
    }

    return { status: 'pending' }
  }

  /**
   * Exchange authorization code for tokens.
   * Verifies PKCE by comparing SHA-256(code_verifier) with stored code_challenge.
   *
   * @param authCode - Authorization code from the callback
   * @param codeVerifier - Original code_verifier generated by Electron
   * @returns Token pair (access + refresh tokens)
   */
  async exchangeCode(authCode: string, codeVerifier: string): Promise<TokenPair> {
    // Find session by auth code
    let foundSession: ElectronAuthSession | undefined
    for (const session of this.sessions.values()) {
      if (session.authCode === authCode) {
        foundSession = session
        break
      }
    }

    if (!foundSession) {
      throw new Error('Invalid authorization code')
    }

    // Check auth code expiry
    if (foundSession.authCodeExpiresAt && foundSession.authCodeExpiresAt < new Date()) {
      this.sessions.delete(foundSession.id)
      throw new Error('Authorization code expired')
    }

    // Verify PKCE: SHA-256(code_verifier) must equal code_challenge
    const calculatedChallenge = this.generateCodeChallenge(codeVerifier)
    if (calculatedChallenge !== foundSession.codeChallenge) {
      throw new Error('PKCE verification failed')
    }

    // Get user
    if (!foundSession.userId) {
      throw new Error('Session has no associated user')
    }

    const user = await this.userRepository.getById(foundSession.userId)
    if (!user) {
      throw new Error('User not found')
    }

    // Generate tokens
    const { tokens, refreshTokenData } = await this.tokenService.generateTokenPair({
      id: user.id,
      username: user.username,
      role: user.role,
    })

    // Store refresh token
    await this.storeRefreshToken(user.id, refreshTokenData)

    // Delete session (one-time use)
    this.sessions.delete(foundSession.id)

    return tokens
  }

  /**
   * Generate code_challenge from code_verifier using SHA-256.
   * This is the same algorithm Electron uses to create the challenge.
   */
  private generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(
    userId: string,
    refreshTokenData: GeneratedRefreshToken
  ): Promise<void> {
    await this.refreshTokenRepository.create({
      userId,
      tokenHash: refreshTokenData.tokenHash,
      expiresAt: refreshTokenData.expiresAt,
      deviceInfo: { userAgent: 'Stina Electron App' },
    })
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date()
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(id)
      }
    }
  }
}
