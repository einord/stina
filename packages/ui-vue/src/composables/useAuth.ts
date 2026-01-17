import { ref, computed, readonly, inject, provide, type InjectionKey, type Ref, type ComputedRef } from 'vue'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import type { User, TokenPair, DeviceInfo } from '../types/auth.js'
import { useApi } from './useApi.js'

/**
 * Token storage keys for localStorage
 */
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'stina_access_token',
  REFRESH_TOKEN: 'stina_refresh_token',
  USER: 'stina_user',
} as const

/**
 * Token refresh interval (refresh 1 minute before expiry, assuming 15 min access token)
 */
const REFRESH_INTERVAL_MS = 14 * 60 * 1000 // 14 minutes

/**
 * Auth composable return type
 */
export interface UseAuthReturn {
  /** Current user */
  user: Readonly<Ref<User | null>>
  /** Current tokens */
  tokens: Readonly<Ref<TokenPair | null>>
  /** Whether user is authenticated */
  isAuthenticated: ComputedRef<boolean>
  /** Whether auth is loading */
  isLoading: Readonly<Ref<boolean>>
  /** Current error message */
  error: Readonly<Ref<string | null>>

  /** Login with passkey */
  login(username?: string): Promise<void>
  /** Register new user with passkey */
  register(username: string, displayName?: string, invitationToken?: string): Promise<void>
  /** Logout current user */
  logout(): Promise<void>
  /** Refresh the access token */
  refreshToken(): Promise<void>
  /** Initialize auth state from storage */
  initialize(): Promise<void>
  /** Clear error message */
  clearError(): void
  /** Get access token for API requests */
  getAccessToken(): string | null
}

/**
 * Injection key for auth composable
 */
export const authKey: InjectionKey<UseAuthReturn> = Symbol('auth')

/**
 * Provide auth composable to child components
 */
export function provideAuth(auth: UseAuthReturn): void {
  provide(authKey, auth)
}

/**
 * Get device information for login tracking
 */
function getDeviceInfo(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  }
}

/**
 * Create the auth composable
 *
 * @returns Auth composable with state and methods
 */
export function createAuth(): UseAuthReturn {
  const api = useApi()

  // Reactive state
  const user = ref<User | null>(null)
  const tokens = ref<TokenPair | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const isAuthenticated = computed(() => !!user.value && !!tokens.value?.accessToken)

  // Token refresh timer
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Save auth state to localStorage
   */
  function saveToStorage(): void {
    if (tokens.value) {
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, tokens.value.accessToken)
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, tokens.value.refreshToken)
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    }

    if (user.value) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user.value))
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER)
    }
  }

  /**
   * Load auth state from localStorage
   */
  function loadFromStorage(): { user: User | null; tokens: TokenPair | null } {
    const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)
    const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)
    const userJson = localStorage.getItem(STORAGE_KEYS.USER)

    let storedUser: User | null = null
    if (userJson) {
      try {
        const parsed = JSON.parse(userJson)
        // Convert date strings back to Date objects
        storedUser = {
          ...parsed,
          createdAt: new Date(parsed.createdAt),
          lastLoginAt: parsed.lastLoginAt ? new Date(parsed.lastLoginAt) : undefined,
        }
      } catch (error) {
        console.error('Failed to parse stored user data:', error)
        storedUser = null
      }
    }

    return {
      user: storedUser,
      tokens: accessToken && refreshToken ? { accessToken, refreshToken } : null,
    }
  }

  /**
   * Clear auth state from localStorage
   */
  function clearStorage(): void {
    localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN)
    localStorage.removeItem(STORAGE_KEYS.USER)
  }

  /**
   * Start auto-refresh timer
   */
  function startRefreshTimer(): void {
    stopRefreshTimer()
    refreshTimer = setTimeout(async () => {
      try {
        await refreshToken()
        startRefreshTimer() // Schedule next refresh
      } catch {
        // Token refresh failed, user needs to re-login
        await logout()
      }
    }, REFRESH_INTERVAL_MS)
  }

  /**
   * Stop auto-refresh timer
   */
  function stopRefreshTimer(): void {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  /**
   * Login with passkey
   */
  async function login(username?: string): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      // Get authentication options from server
      const options = await api.auth.getLoginOptions(username)

      // Start WebAuthn authentication (v11 API requires optionsJSON wrapper)
      const credential = await startAuthentication({
        optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON']
      })

      // Verify with server
      const result = await api.auth.verifyLogin(credential, getDeviceInfo())

      // Update state
      user.value = result.user
      tokens.value = result.tokens

      // Persist and start refresh timer
      saveToStorage()
      startRefreshTimer()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      error.value = message
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Register new user with passkey
   */
  async function register(
    username: string,
    displayName?: string,
    invitationToken?: string
  ): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      // Get registration options from server
      const { options } = await api.auth.getRegistrationOptions(
        username,
        displayName,
        invitationToken
      )

      // Start WebAuthn registration (v11 API requires optionsJSON wrapper)
      const credential = await startRegistration({
        optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON']
      })

      // Verify with server
      const result = await api.auth.verifyRegistration(username, credential, invitationToken)

      // Update state
      user.value = result.user
      tokens.value = result.tokens

      // Persist and start refresh timer
      saveToStorage()
      startRefreshTimer()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      error.value = message
      throw new Error(message)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Logout current user
   */
  async function logout(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      if (tokens.value?.refreshToken) {
        await api.auth.logout(tokens.value.refreshToken)
      }
    } catch {
      // Ignore logout errors, clear state anyway
    } finally {
      // Clear state
      user.value = null
      tokens.value = null
      stopRefreshTimer()
      clearStorage()
      isLoading.value = false
    }
  }

  /**
   * Refresh the access token
   */
  async function refreshToken(): Promise<void> {
    if (!tokens.value?.refreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const result = await api.auth.refresh(tokens.value.refreshToken)
      user.value = result.user
      tokens.value = result.tokens
      saveToStorage()
    } catch (err) {
      // Clear state on refresh failure
      user.value = null
      tokens.value = null
      stopRefreshTimer()
      clearStorage()
      throw err
    }
  }

  /**
   * Initialize auth state from storage
   */
  async function initialize(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const stored = loadFromStorage()

      if (stored.tokens?.refreshToken) {
        // Try to refresh token to validate it
        tokens.value = stored.tokens
        await refreshToken()
        startRefreshTimer()
      }
    } catch {
      // Token invalid, clear state
      user.value = null
      tokens.value = null
      clearStorage()
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Clear error message
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * Get access token for API requests
   */
  function getAccessToken(): string | null {
    return tokens.value?.accessToken ?? null
  }

  return {
    user: readonly(user),
    tokens: readonly(tokens),
    isAuthenticated,
    isLoading: readonly(isLoading),
    error: readonly(error),
    login,
    register,
    logout,
    refreshToken,
    initialize,
    clearError,
    getAccessToken,
  }
}

/**
 * Use the auth composable from injection
 *
 * @returns Auth composable
 * @throws Error if not provided
 */
export function useAuth(): UseAuthReturn {
  const auth = inject(authKey)
  if (!auth) {
    throw new Error('Auth not provided. Make sure to call provideAuth in the app root.')
  }
  return auth
}
