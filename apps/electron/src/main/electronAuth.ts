import { BrowserWindow, shell, app } from 'electron'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getApiUrl } from '@stina/core'
import { setAuthCallback, setAuthErrorCallback } from './authProtocol.js'
import { createAuthWindow, closeAuthWindow } from './authWindow.js'
import { secureStorage, type TokenPair } from './secureStorage.js'

/**
 * Check if we should use external browser for authentication.
 * On macOS, WebAuthn doesn't work in BrowserWindow when the app is not
 * packaged (running from terminal via `pnpm dev`). This is because the
 * process is not "self-responsible" - a macOS security requirement.
 */
function shouldUseExternalBrowser(): boolean {
  // On macOS, use external browser if app is not packaged
  if (process.platform === 'darwin' && !app.isPackaged) {
    return true
  }
  return false
}

/**
 * Pending authentication session
 */
interface AuthSession {
  codeVerifier: string
  state: string
  sessionId: string
  webUrl: string
  apiUrl: string
  resolve: (tokens: TokenPair) => void
  reject: (error: Error) => void
  pollingAborted: boolean
  authWindow: BrowserWindow | null
}

// Polling configuration
const POLL_INTERVAL_MS = 3000 // 3 seconds
const POLL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Manages authentication for Electron.
 * Uses a dedicated BrowserWindow for the auth flow, with polling as fallback.
 */
class ElectronAuthManager {
  private pendingSession: AuthSession | null = null

  constructor() {
    // Set up protocol callback handler (for external browser fallback on macOS)
    setAuthCallback((code, state) => this.handleCallback(code, state))
    setAuthErrorCallback((error) => this.handleError(error))
  }

  /**
   * Initiate authentication using a dedicated BrowserWindow.
   *
   * @param webUrl - The base URL of the Stina web application
   * @returns Promise that resolves with tokens on successful auth
   */
  async authenticate(webUrl: string): Promise<TokenPair> {
    // Cancel any existing session
    if (this.pendingSession) {
      this.pendingSession.pollingAborted = true
      closeAuthWindow(this.pendingSession.authWindow)
      this.pendingSession.reject(new Error('New authentication started'))
      this.pendingSession = null
    }

    // Calculate API URL from web URL
    const apiUrl = getApiUrl(webUrl)

    // Generate PKCE parameters
    const codeVerifier = this.generateCodeVerifier()
    const codeChallenge = this.generateCodeChallenge(codeVerifier)

    // Generate state for CSRF protection
    const state = randomUUID()

    // First, create a session on the server
    let sessionId: string
    try {
      const sessionResponse = await fetch(`${apiUrl}/auth/electron/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_challenge: codeChallenge,
          state,
        }),
      })

      if (!sessionResponse.ok) {
        const error = (await sessionResponse.json()) as { error?: string }
        throw new Error(error.error || 'Failed to create authentication session')
      }

      const sessionData = (await sessionResponse.json()) as { session_id: string }
      sessionId = sessionData.session_id
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to connect to server'
      )
    }

    // Create promise that will be resolved when auth completes
    return new Promise<TokenPair>((resolve, reject) => {
      this.pendingSession = {
        codeVerifier,
        state,
        sessionId,
        webUrl,
        apiUrl,
        resolve,
        reject,
        pollingAborted: false,
        authWindow: null,
      }

      // Check if we should use external browser (e.g., macOS in dev mode)
      const useExternalBrowser = shouldUseExternalBrowser()
      const loginUrl = new URL(`${webUrl}/auth/electron-login`)
      loginUrl.searchParams.set('session_id', sessionId)

      if (useExternalBrowser) {
        // Use external browser (Safari/Chrome) which has proper WebAuthn support
        console.log('Using external browser for authentication (WebAuthn requires packaged app on macOS)')
        shell.openExternal(loginUrl.toString())
      } else {
        // Try to use BrowserWindow for better UX
        try {
          const authWindow = createAuthWindow({
            webUrl,
            sessionId,
            onSuccess: (code, receivedState) => {
              this.handleCallback(code, receivedState)
            },
            onError: (error) => {
              this.handleError(error)
            },
            onCancel: () => {
              this.handleError('User cancelled authentication')
            },
          })

          if (this.pendingSession) {
            this.pendingSession.authWindow = authWindow
          }
        } catch {
          // If BrowserWindow fails, fall back to external browser
          console.warn('Failed to create auth window, falling back to external browser')
          shell.openExternal(loginUrl.toString())
        }
      }

      // Start polling as fallback (in case auth window or custom protocol doesn't work)
      this.startPolling(sessionId, apiUrl, codeVerifier, state)

      // Set timeout
      setTimeout(() => {
        if (this.pendingSession?.state === state) {
          this.pendingSession.pollingAborted = true
          closeAuthWindow(this.pendingSession.authWindow)
          this.pendingSession.reject(new Error('Authentication timeout'))
          this.pendingSession = null
        }
      }, POLL_TIMEOUT_MS)
    })
  }

  /**
   * Handle callback from auth window or custom protocol.
   */
  private async handleCallback(code: string, state: string): Promise<void> {
    if (!this.pendingSession || this.pendingSession.state !== state) {
      console.error('Invalid or expired authentication session')
      return
    }

    const { codeVerifier, apiUrl, resolve, reject, authWindow } = this.pendingSession
    this.pendingSession.pollingAborted = true
    closeAuthWindow(authWindow)
    this.pendingSession = null

    try {
      const tokens = await this.exchangeCode(code, codeVerifier, apiUrl)
      resolve(tokens)
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Token exchange failed'))
    }
  }

  /**
   * Handle error from auth window or custom protocol.
   */
  private handleError(error: string): void {
    if (this.pendingSession) {
      this.pendingSession.pollingAborted = true
      closeAuthWindow(this.pendingSession.authWindow)
      this.pendingSession.reject(new Error(error))
      this.pendingSession = null
    }
  }

  /**
   * Start polling for authentication completion.
   * Used as fallback when auth window or custom protocol doesn't work.
   */
  private async startPolling(
    sessionId: string,
    apiUrl: string,
    codeVerifier: string,
    state: string
  ): Promise<void> {
    const startTime = Date.now()

    const poll = async (): Promise<void> => {
      // Check if session is still active
      if (!this.pendingSession || this.pendingSession.pollingAborted) {
        return
      }

      // Check timeout
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        return
      }

      try {
        const response = await fetch(`${apiUrl}/auth/electron/poll?session_id=${sessionId}`)
        const result = (await response.json()) as {
          status: 'pending' | 'completed' | 'error' | 'not_found'
          code?: string
          state?: string
          error?: string
        }

        if (result.status === 'completed' && result.code && result.state === state) {
          // Auth completed via browser, exchange code
          if (this.pendingSession && !this.pendingSession.pollingAborted) {
            const { resolve, reject, authWindow } = this.pendingSession
            this.pendingSession.pollingAborted = true
            closeAuthWindow(authWindow)
            this.pendingSession = null

            try {
              const tokens = await this.exchangeCode(result.code, codeVerifier, apiUrl)
              resolve(tokens)
            } catch (error) {
              reject(error instanceof Error ? error : new Error('Token exchange failed'))
            }
          }
          return
        }

        if (result.status === 'error') {
          if (this.pendingSession && !this.pendingSession.pollingAborted) {
            this.pendingSession.pollingAborted = true
            closeAuthWindow(this.pendingSession.authWindow)
            this.pendingSession.reject(new Error(result.error || 'Authentication failed'))
            this.pendingSession = null
          }
          return
        }

        // Still pending, continue polling
        setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        // Network error, continue polling
        setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    // Start polling after a short delay to give auth window a chance
    setTimeout(poll, POLL_INTERVAL_MS)
  }

  /**
   * Exchange authorization code for tokens.
   */
  private async exchangeCode(
    code: string,
    codeVerifier: string,
    apiUrl: string
  ): Promise<TokenPair> {
    const response = await fetch(`${apiUrl}/auth/electron/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
      }),
    })

    if (!response.ok) {
      const error = (await response.json()) as { error?: string }
      throw new Error(error.error || 'Token exchange failed')
    }

    const tokens = (await response.json()) as TokenPair
    return tokens
  }

  /**
   * Generate a cryptographically secure code verifier for PKCE.
   * Must be between 43-128 characters, using unreserved characters.
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url')
  }

  /**
   * Generate code challenge from code verifier using SHA-256.
   */
  private generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url')
  }

  /**
   * Check if there's a pending authentication.
   */
  isPending(): boolean {
    return this.pendingSession !== null
  }

  /**
   * Cancel any pending authentication.
   */
  cancel(): void {
    if (this.pendingSession) {
      this.pendingSession.pollingAborted = true
      closeAuthWindow(this.pendingSession.authWindow)
      this.pendingSession.reject(new Error('Authentication cancelled'))
      this.pendingSession = null
    }
  }
}

// Singleton instance
export const electronAuthManager = new ElectronAuthManager()

// Re-export secure storage functions for convenience
export { secureStorage }
export type { TokenPair }
