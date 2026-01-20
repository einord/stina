<script setup lang="ts">
/**
 * Electron login view for passkey authentication.
 * This view is shown in the Electron auth popup window.
 * After successful authentication, redirects to stina://callback with the auth code.
 */
import { ref, onMounted } from 'vue'
import { startAuthentication } from '@simplewebauthn/browser'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'

const props = defineProps<{
  /** The session ID from the URL */
  sessionId: string
}>()

const api = useApi()

// State
const isLoading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

/**
 * Get device info for login tracking
 */
function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
  }
}

/**
 * Perform the login flow
 */
async function login(): Promise<void> {
  if (isLoading.value) return

  isLoading.value = true
  error.value = null

  try {
    // 1. Get authentication options from server
    const options = await api.auth.getLoginOptions()

    // 2. Start WebAuthn authentication
    const credential = await startAuthentication({
      optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
    })

    // 3. Verify with server and get auth code
    const result = await verifyElectronLogin(props.sessionId, credential, getDeviceInfo())

    if (result.code && result.state) {
      success.value = true

      // 4. Redirect to Electron app via custom protocol
      const callbackUrl = `stina://callback?code=${encodeURIComponent(result.code)}&state=${encodeURIComponent(result.state)}`
      window.location.href = callbackUrl
    } else {
      throw new Error('Invalid response from server')
    }
  } catch (err) {
    console.error('Login error:', err)
    error.value = err instanceof Error ? err.message : 'Authentication failed'
  } finally {
    isLoading.value = false
  }
}

/**
 * Verify electron login with the server
 */
async function verifyElectronLogin(
  sessionId: string,
  credential: unknown,
  deviceInfo: { userAgent: string }
): Promise<{ code: string; state: string }> {
  const response = await fetch('/api/auth/electron-login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      credential,
      deviceInfo,
    }),
  })

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Verification failed')
  }

  return response.json()
}

/**
 * Auto-start login on mount
 */
onMounted(() => {
  login()
})
</script>

<template>
  <div class="electron-login-view">
    <div class="login-container">
      <!-- Header -->
      <div class="header">
        <Icon name="stina:head" class="header-icon" />
        <h1 class="title">Sign in to Stina</h1>
        <p class="subtitle">Use your passkey to authenticate</p>
      </div>

      <!-- Content -->
      <div class="content">
        <!-- Loading state -->
        <div v-if="isLoading && !error" class="status-box loading">
          <Icon name="hugeicons:loading-02" class="loading-icon" :size="32" />
          <p>Authenticating...</p>
          <p class="hint">Complete the passkey verification</p>
        </div>

        <!-- Success state -->
        <div v-else-if="success" class="status-box success">
          <Icon name="hugeicons:check-circle" :size="32" />
          <p>Authentication successful!</p>
          <p class="hint">Returning to the app...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="status-box error">
          <Icon name="hugeicons:alert-circle" :size="32" />
          <p>{{ error }}</p>

          <SimpleButton type="primary" class="retry-button" @click="login">
            <span class="button-content">
              <Icon name="hugeicons:finger-print" />
              <span>Try again</span>
            </span>
          </SimpleButton>
        </div>

        <!-- Initial state (shouldn't be visible long) -->
        <div v-else class="status-box">
          <SimpleButton type="primary" class="login-button" @click="login">
            <span class="button-content">
              <Icon name="hugeicons:finger-print" />
              <span>Sign in with passkey</span>
            </span>
          </SimpleButton>
        </div>
      </div>

      <!-- Help text -->
      <p class="help-text">
        Use your fingerprint, face, or security key to sign in.
      </p>
    </div>
  </div>
</template>

<style scoped>
.electron-login-view {
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

.content {
  margin-bottom: 1.5rem;
}

.status-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  border-radius: 0.75rem;
  text-align: center;

  > p {
    margin: 0;
    color: var(--theme-general-color);
  }

  > .hint {
    font-size: 0.875rem;
    color: var(--theme-general-color-muted);
  }
}

.status-box.loading {
  background: var(--theme-general-background-secondary);
}

.status-box.success {
  background: var(--theme-general-background-success, rgba(34, 197, 94, 0.1));
  color: var(--theme-general-color-success, #22c55e);

  > p {
    color: var(--theme-general-color-success, #22c55e);
  }
}

.status-box.error {
  background: var(--theme-general-color-danger-background, rgba(239, 68, 68, 0.1));

  > p:first-of-type {
    color: var(--theme-general-color-danger, #ef4444);
  }
}

.loading-icon {
  animation: spin 1s linear infinite;
}

.login-button,
.retry-button {
  margin-top: 0.5rem;
}

.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.help-text {
  text-align: center;
  font-size: 0.75rem;
  color: var(--theme-general-color-muted);
  margin: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
