<script setup lang="ts">
/**
 * Initial setup view displayed when no users exist.
 * Handles domain configuration and first admin user registration.
 */
import { ref, computed, onMounted } from 'vue'
import { startRegistration } from '@simplewebauthn/browser'
import TextInput from '../inputs/TextInput.vue'
import Toggle from '../inputs/Toggle.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'
import type { User, TokenPair } from '../../types/auth.js'

const emit = defineEmits<{
  /** Emitted when setup is completed successfully */
  complete: [user: User, tokens: TokenPair]
  /** Emitted when setup is already done and user should go to login */
  redirectToLogin: []
}>()

const api = useApi()

// State for setup steps
type SetupStep = 'loading' | 'domain' | 'register'
const step = ref<SetupStep>('loading')
const isLoading = ref(false)
const error = ref<string | null>(null)

// Domain configuration
const domain = ref('')
const domainConfirmed = ref(false)

// User registration
const username = ref('')
const displayName = ref('')
const registrationOptions = ref<unknown>(null)

/**
 * Computed rpId (just the hostname, without port)
 * WebAuthn rpId should be the effective domain without port
 */
const rpId = computed(() => {
  if (!domain.value) return ''
  // Extract hostname without port
  const [hostname] = domain.value.split(':')
  return hostname || ''
})

/**
 * Computed origin based on domain
 * Uses http for localhost, https for everything else
 */
const origin = computed(() => {
  if (!domain.value) return ''
  const isLocalhost = domain.value.startsWith('localhost') || domain.value.startsWith('127.0.0.1')
  const protocol = isLocalhost ? 'http' : 'https'
  return `${protocol}://${domain.value}`
})

/**
 * Validation for domain form
 */
const isDomainValid = computed(() => {
  return domain.value.length > 0 && domainConfirmed.value
})

/**
 * Validation for registration form
 */
const isRegistrationValid = computed(() => {
  return username.value.length >= 3
})

/**
 * Check setup status on mount
 */
onMounted(async () => {
  try {
    const status = await api.auth.getSetupStatus()
    if (status.setupCompleted && !status.isFirstUser) {
      // Setup done AND users exist - redirect to login
      emit('redirectToLogin')
    } else if (status.setupCompleted && status.isFirstUser) {
      // Domain configured but no users yet (registration failed midway)
      // Skip to registration step
      step.value = 'register'
    } else {
      // Need to do full setup (domain + registration)
      step.value = 'domain'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to check setup status'
    step.value = 'domain'
  }
})

/**
 * Complete domain setup and move to registration
 */
async function completeDomainSetup(): Promise<void> {
  if (!isDomainValid.value) return

  isLoading.value = true
  error.value = null

  try {
    // Use rpId (hostname only) for WebAuthn, origin includes protocol and port
    await api.auth.completeSetup(rpId.value, origin.value)
    step.value = 'register'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to complete domain setup'
  } finally {
    isLoading.value = false
  }
}

/**
 * Get registration options for the admin user
 */
async function getRegistrationOptions(): Promise<void> {
  if (!isRegistrationValid.value) return

  isLoading.value = true
  error.value = null

  try {
    const response = await api.auth.getRegistrationOptions(
      username.value,
      displayName.value || undefined
    )
    registrationOptions.value = response.options
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get registration options'
  } finally {
    isLoading.value = false
  }
}

/**
 * Complete registration with WebAuthn
 */
async function completeRegistration(): Promise<void> {
  if (!registrationOptions.value) return

  isLoading.value = true
  error.value = null

  try {
    // v11 API requires optionsJSON wrapper
    const credential = await startRegistration({
      optionsJSON: registrationOptions.value as Parameters<typeof startRegistration>[0]['optionsJSON']
    })

    const result = await api.auth.verifyRegistration(username.value, credential)
    emit('complete', result.user, result.tokens)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Registration failed'
    registrationOptions.value = null
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="setup-view">
    <div class="setup-container">
      <!-- Header -->
      <div class="header">
        <Icon name="hugeicons:settings-02" class="header-icon" />
        <h1 class="title">Welcome to Stina</h1>
        <p class="subtitle">Let's set up your instance</p>
      </div>

      <!-- Loading state -->
      <div v-if="step === 'loading'" class="loading-state">
        <Icon name="hugeicons:loading-02" class="loading-icon" />
        <p>Checking setup status...</p>
      </div>

      <!-- Domain setup step -->
      <div v-else-if="step === 'domain'" class="step-content">
        <div class="step-header">
          <span class="step-number">1</span>
          <span class="step-title">Configure domain</span>
        </div>

        <p class="step-description">
          Enter the domain where Stina will be accessed. This is used for passkey authentication and
          cannot be changed later without invalidating all passkeys.
        </p>

        <form class="form" @submit.prevent="completeDomainSetup">
          <TextInput
            v-model="domain"
            label="Domain"
            placeholder="stina.example.com or localhost:3002"
            hint="Enter domain with port if needed (e.g. localhost:3002 for local dev)"
            :error="undefined"
            :disabled="isLoading"
          />

          <TextInput
            :model-value="origin"
            label="Origin (auto-generated)"
            :disabled="true"
            hint="Full URL for authentication (http for localhost, https otherwise)"
          />

          <Toggle
            v-model="domainConfirmed"
            label="I understand this cannot be changed"
            description="Changing the domain later will require re-registering all passkeys"
            :disabled="isLoading"
          />

          <div v-if="error" class="error-message">
            <Icon name="hugeicons:alert-circle" />
            <span>{{ error }}</span>
          </div>

          <SimpleButton type="primary" html-type="submit" :disabled="!isDomainValid || isLoading">
            <span v-if="isLoading">
              <Icon name="hugeicons:loading-02" class="button-loading" />
              Setting up...
            </span>
            <span v-else>Continue to registration</span>
          </SimpleButton>
        </form>
      </div>

      <!-- Registration step -->
      <div v-else-if="step === 'register'" class="step-content">
        <div class="step-header">
          <span class="step-number">2</span>
          <span class="step-title">Create admin account</span>
        </div>

        <p class="step-description">
          Create the first administrator account. You'll use a passkey to authenticate - no password
          needed.
        </p>

        <form
          class="form"
          @submit.prevent="registrationOptions ? completeRegistration() : getRegistrationOptions()"
        >
          <TextInput
            v-model="username"
            label="Username"
            placeholder="admin"
            hint="Must be at least 3 characters"
            :disabled="isLoading || !!registrationOptions"
          />

          <TextInput
            v-model="displayName"
            label="Display name (optional)"
            placeholder="Administrator"
            :disabled="isLoading || !!registrationOptions"
          />

          <div v-if="error" class="error-message">
            <Icon name="hugeicons:alert-circle" />
            <span>{{ error }}</span>
          </div>

          <SimpleButton
            v-if="!registrationOptions"
            type="primary"
            html-type="submit"
            :disabled="!isRegistrationValid || isLoading"
          >
            <span v-if="isLoading">
              <Icon name="hugeicons:loading-02" class="button-loading" />
              Preparing...
            </span>
            <span v-else>
              <Icon name="hugeicons:finger-print" />
              Register passkey
            </span>
          </SimpleButton>

          <SimpleButton v-else type="primary" html-type="submit" :disabled="isLoading">
            <span v-if="isLoading">
              <Icon name="hugeicons:loading-02" class="button-loading" />
              Registering...
            </span>
            <span v-else>
              <Icon name="hugeicons:finger-print" />
              Complete registration
            </span>
          </SimpleButton>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--theme-general-background);
}

.setup-container {
  width: 100%;
  max-width: 480px;
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

.loading-state {
  text-align: center;
  padding: 2rem;
  color: var(--theme-general-color-muted);
}

.loading-icon {
  font-size: 2rem;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.step-number {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--theme-general-color-primary);
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  border-radius: 50%;
}

.step-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--theme-general-color);
}

.step-description {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  line-height: 1.5;
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

.button-loading {
  animation: spin 1s linear infinite;
  margin-right: 0.5rem;
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
