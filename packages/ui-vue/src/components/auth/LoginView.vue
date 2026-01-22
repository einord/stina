<script setup lang="ts">
/**
 * Login view for passkey authentication.
 * Provides a simple interface for users to login using their registered passkeys.
 * In Electron, uses external browser authentication to avoid WebAuthn origin issues.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { startAuthentication } from '@simplewebauthn/browser'
import TextInput from '../inputs/TextInput.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'
import { useApp } from '../../composables/useApp.js'
import type { User, TokenPair } from '../../types/auth.js'

const props = withDefaults(
  defineProps<{
    /** Optional title override */
    title?: string
    /** Optional subtitle override */
    subtitle?: string
    /** Whether to show the username field */
    showUsername?: boolean
    /** Whether to allow switching to local/standalone mode (Electron only) */
    allowLocalMode?: boolean
    /** Web application URL (required for Electron auth) */
    webUrl?: string
  }>(),
  {
    title: 'Welcome back',
    subtitle: 'Sign in with your passkey',
    showUsername: false,
    allowLocalMode: false,
    webUrl: '',
  }
)

const emit = defineEmits<{
  /** Emitted on successful login */
  success: [user: User, tokens: TokenPair]
  /** Emitted on login error */
  error: [message: string]
  /** Emitted when user wants to switch to local mode */
  switchToLocal: []
}>()

const api = useApi()
const app = useApp()

// State
const username = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const loginOptions = ref<unknown>(null)
const waitingForBrowser = ref(false)

/**
 * Get device info for login tracking
 */
function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
  }
}

/**
 * Fetch login options from server (for web/browser auth)
 */
async function getLoginOptions(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const options = await api.auth.getLoginOptions(
      props.showUsername && username.value ? username.value : undefined
    )
    loginOptions.value = options
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get login options'
    emit('error', error.value)
  } finally {
    isLoading.value = false
  }
}

/**
 * Login using BrowserWindow (Electron only)
 * Opens a dedicated window for WebAuthn authentication
 */
async function loginWithExternalBrowser(): Promise<void> {
  if (!app.isWindowed) return

  isLoading.value = true
  waitingForBrowser.value = true
  error.value = null

  try {
    // Get the web URL from props
    const electronAPI = (
      window as unknown as {
        electronAPI?: {
          authExternalLogin: (
            webUrl: string
          ) => Promise<{ accessToken: string; refreshToken: string }>
          authSetTokens: (
            tokens: { accessToken: string; refreshToken: string } | null
          ) => Promise<{ success: boolean }>
        }
      }
    ).electronAPI

    if (!electronAPI) {
      throw new Error('Electron API not available')
    }

    // Use web URL from props
    const webUrl = props.webUrl
    if (!webUrl) {
      throw new Error('Server URL not configured')
    }

    // Start authentication
    const tokens = await electronAPI.authExternalLogin(webUrl)

    // Store tokens securely
    await electronAPI.authSetTokens(tokens)

    // Emit success with tokens (user info will be fetched by parent)
    emit('success', {} as User, tokens as TokenPair)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed'
    error.value = message
    emit('error', message)
  } finally {
    isLoading.value = false
    waitingForBrowser.value = false
  }
}

/**
 * Complete login with WebAuthn (web only, not Electron)
 */
async function loginWithWebAuthn(): Promise<void> {
  if (!loginOptions.value) {
    await getLoginOptions()
    if (!loginOptions.value) return
  }

  isLoading.value = true
  error.value = null

  try {
    // v11 API requires optionsJSON wrapper
    const credential = await startAuthentication({
      optionsJSON: loginOptions.value as Parameters<typeof startAuthentication>[0]['optionsJSON'],
    })

    const result = await api.auth.verifyLogin(credential, getDeviceInfo())
    emit('success', result.user, result.tokens)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed'
    error.value = message
    emit('error', message)
    // Reset options to allow retry
    loginOptions.value = null
  } finally {
    isLoading.value = false
  }
}

/**
 * Main login handler - routes to appropriate method
 */
async function login(): Promise<void> {
  if (app.isWindowed) {
    await loginWithExternalBrowser()
  } else {
    await loginWithWebAuthn()
  }
}

/**
 * Cancel ongoing authentication (Electron only)
 */
function cancelAuth(): void {
  if (app.isWindowed && waitingForBrowser.value) {
    const electronAPI = (
      window as unknown as {
        electronAPI?: {
          authCancel: () => void
        }
      }
    ).electronAPI
    electronAPI?.authCancel()
    waitingForBrowser.value = false
    isLoading.value = false
  }
}

/**
 * Initialize authentication
 * - In Electron: automatically start the auth flow
 * - In Web: fetch login options if username is not required
 */
onMounted(async () => {
  if (app.isWindowed) {
    // Automatically start auth flow in Electron
    await loginWithExternalBrowser()
  } else if (!props.showUsername) {
    await getLoginOptions()
  }
})

/**
 * Clean up on unmount
 */
onUnmounted(() => {
  cancelAuth()
})

/**
 * Clear error and reset state
 */
function clearError(): void {
  error.value = null
}

/**
 * Switch to local/standalone mode (Electron only)
 */
function switchToLocalMode(): void {
  emit('switchToLocal')
}
</script>

<template>
  <div class="login-view">
    <!-- Drag region for Electron window (macOS hiddenInset titlebar) -->
    <div v-if="app.isWindowed" class="drag-bar" />

    <div class="login-container">
      <!-- Header -->
      <div class="header">
        <Icon name="stina:head" class="header-icon" />
        <h1 class="title">{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </div>

      <!-- Electron: Show waiting state with auto-opened popup -->
      <div v-if="app.isWindowed" class="form">
        <!-- Error message -->
        <div v-if="error" class="error-message">
          <Icon name="hugeicons:alert-circle" />
          <span>{{ error }}</span>
        </div>

        <!-- Waiting state (shown during auth) -->
        <div v-if="isLoading && !error" class="waiting-state">
          <Icon name="hugeicons:loading-02" class="loading-icon" :size="32" />
          <p>Waiting for authentication...</p>
          <p class="waiting-hint">Complete the login in the popup window</p>
        </div>

        <!-- Retry button (shown on error) -->
        <SimpleButton
          v-if="error"
          type="primary"
          class="login-button"
          @click="loginWithExternalBrowser"
        >
          <span class="button-content">
            <Icon name="hugeicons:finger-print" />
            <span>Try again</span>
          </span>
        </SimpleButton>

        <!-- Cancel button -->
        <SimpleButton v-if="isLoading" type="normal" class="cancel-button" @click="cancelAuth">
          Cancel
        </SimpleButton>
      </div>

      <!-- Web: Show regular login form -->
      <form v-else class="form" @submit.prevent="login">
        <!-- Optional username field -->
        <TextInput
          v-if="showUsername"
          v-model="username"
          label="Username (optional)"
          placeholder="Enter your username"
          hint="Leave empty to show all available passkeys"
          :disabled="isLoading"
          @input="clearError"
        />

        <!-- Error message -->
        <div v-if="error" class="error-message">
          <Icon name="hugeicons:alert-circle" />
          <span>{{ error }}</span>
        </div>

        <!-- Login button -->
        <SimpleButton type="primary" html-type="submit" :disabled="isLoading" class="login-button">
          <span class="button-content">
            <Icon v-if="isLoading" name="hugeicons:loading-02" class="loading-icon" />
            <Icon v-else name="hugeicons:finger-print" />
            <span v-if="isLoading">Authenticating...</span>
            <span v-else>Login with passkey</span>
          </span>
        </SimpleButton>
      </form>

      <!-- Help text -->
      <p v-if="!app.isWindowed" class="help-text">
        Use your fingerprint, face, or security key to sign in.
      </p>

      <!-- Switch to local mode (Electron only) -->
      <div v-if="app.isWindowed && allowLocalMode" class="local-mode-section">
        <button class="local-mode-link" @click="switchToLocalMode">
          Use standalone mode instead
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--theme-general-background);
}

.login-container {
  width: 100%;
  max-width: 400px;
  background: var(--theme-components-card-background, var(--theme-general-background));
  border: 1px solid var(--theme-general-border-color);
  border-radius: 1rem;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 2rem;
}

.header-icon {
  font-size: 4rem;
  color: var(--theme-general-color-muted);
  margin-bottom: 1rem;
}

.title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0 0 0.5rem 0;
}

.subtitle {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  margin: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid var(--theme-general-color-danger, #dc2626);
  border-radius: 0.5rem;
  color: var(--theme-general-color-danger, #dc2626);
  font-size: 0.875rem;
}

.login-button {
  width: 100%;
}

.cancel-button {
  width: 100%;
}

.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

.help-text {
  text-align: center;
  font-size: 0.75rem;
  color: var(--theme-general-color-muted);
  margin: 1.5rem 0 0 0;
}

.waiting-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem;
  color: var(--theme-general-color);

  > p {
    margin: 0;
    text-align: center;
  }

  > .waiting-hint {
    font-size: 0.875rem;
    color: var(--theme-general-color-muted);
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Drag region for Electron window movement */
.drag-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px; /* Matches titleBarOverlay.height in Electron */
  -webkit-app-region: drag;
  z-index: 9999;
  pointer-events: auto;
}

/* Local mode switch section */
.local-mode-section {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--theme-general-border-color);
  text-align: center;
}

.local-mode-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--theme-general-color-muted);
  font-size: 0.75rem;
  cursor: pointer;
  text-decoration: underline;
  transition: color 0.2s;
}

.local-mode-link:hover {
  color: var(--theme-general-color);
}
</style>
