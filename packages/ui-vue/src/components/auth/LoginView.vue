<script setup lang="ts">
/**
 * Login view for passkey authentication.
 * Provides a simple interface for users to login using their registered passkeys.
 */
import { ref, onMounted } from 'vue'
import { startAuthentication } from '@simplewebauthn/browser'
import TextInput from '../inputs/TextInput.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'
import type { User, TokenPair } from '../../types/auth.js'

const props = withDefaults(
  defineProps<{
    /** Optional title override */
    title?: string
    /** Optional subtitle override */
    subtitle?: string
    /** Whether to show the username field */
    showUsername?: boolean
  }>(),
  {
    title: 'Welcome back',
    subtitle: 'Sign in with your passkey',
    showUsername: false,
  }
)

const emit = defineEmits<{
  /** Emitted on successful login */
  success: [user: User, tokens: TokenPair]
  /** Emitted on login error */
  error: [message: string]
}>()

const api = useApi()

// State
const username = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const loginOptions = ref<unknown>(null)

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
 * Fetch login options from server
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
 * Complete login with WebAuthn
 */
async function login(): Promise<void> {
  if (!loginOptions.value) {
    await getLoginOptions()
    if (!loginOptions.value) return
  }

  isLoading.value = true
  error.value = null

  try {
    // v11 API requires optionsJSON wrapper
    const credential = await startAuthentication({
      optionsJSON: loginOptions.value as Parameters<typeof startAuthentication>[0]['optionsJSON']
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
 * Initialize by fetching login options if username is not required
 */
onMounted(async () => {
  if (!props.showUsername) {
    await getLoginOptions()
  }
})

/**
 * Clear error and reset state
 */
function clearError(): void {
  error.value = null
}
</script>

<template>
  <div class="login-view">
    <div class="login-container">
      <!-- Header -->
      <div class="header">
        <Icon name="hugeicons:finger-print" class="header-icon" />
        <h1 class="title">{{ title }}</h1>
        <p class="subtitle">{{ subtitle }}</p>
      </div>

      <!-- Login form -->
      <form class="form" @submit.prevent="login">
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
        <SimpleButton
          type="primary"
          html-type="submit"
          :disabled="isLoading"
          class="login-button"
        >
          <span class="button-content">
            <Icon
              v-if="isLoading"
              name="hugeicons:loading-02"
              class="loading-icon"
            />
            <Icon
              v-else
              name="hugeicons:finger-print"
            />
            <span>{{ isLoading ? 'Authenticating...' : 'Login with passkey' }}</span>
          </span>
        </SimpleButton>
      </form>

      <!-- Help text -->
      <p class="help-text">
        Use your fingerprint, face, or security key to sign in.
      </p>
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
  font-size: 3rem;
  color: var(--theme-general-color-primary);
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
