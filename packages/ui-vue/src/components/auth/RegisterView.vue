<script setup lang="ts">
/**
 * Registration view for invited users.
 * Validates invitation token and allows users to register their passkey.
 */
import { ref, computed, onMounted } from 'vue'
import { startRegistration } from '@simplewebauthn/browser'
import TextInput from '../inputs/TextInput.vue'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { useApi } from '../../composables/useApi.js'
import type { User, TokenPair } from '../../types/auth.js'

const props = defineProps<{
  /** Invitation token from URL */
  invitationToken: string
}>()

const emit = defineEmits<{
  /** Emitted on successful registration */
  success: [user: User, tokens: TokenPair]
  /** Emitted on registration error */
  error: [message: string]
  /** Emitted when invitation is invalid */
  invalidInvitation: []
}>()

const api = useApi()

// State
type ViewState = 'loading' | 'valid' | 'invalid' | 'registering'
const viewState = ref<ViewState>('loading')
const username = ref('')
const displayName = ref('')
const role = ref<string>('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const registrationOptions = ref<unknown>(null)

/**
 * Whether display name can be edited
 */
const canEditDisplayName = computed(() => {
  return viewState.value === 'valid' && !registrationOptions.value
})

/**
 * Validate the invitation token on mount
 */
onMounted(async () => {
  if (!props.invitationToken) {
    viewState.value = 'invalid'
    emit('invalidInvitation')
    return
  }

  try {
    const validation = await api.auth.validateInvitation(props.invitationToken)

    if (validation.valid && validation.username) {
      username.value = validation.username
      role.value = validation.role || 'user'
      viewState.value = 'valid'
    } else {
      viewState.value = 'invalid'
      emit('invalidInvitation')
    }
  } catch (err) {
    viewState.value = 'invalid'
    emit('invalidInvitation')
  }
})

/**
 * Get registration options from server
 */
async function getRegistrationOptions(): Promise<void> {
  isLoading.value = true
  error.value = null

  try {
    const response = await api.auth.getRegistrationOptions(
      username.value,
      displayName.value || undefined,
      props.invitationToken
    )
    registrationOptions.value = response.options
    viewState.value = 'registering'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to get registration options'
    emit('error', error.value)
  } finally {
    isLoading.value = false
  }
}

/**
 * Complete registration with WebAuthn
 */
async function register(): Promise<void> {
  if (!registrationOptions.value) {
    await getRegistrationOptions()
    if (!registrationOptions.value) return
  }

  isLoading.value = true
  error.value = null

  try {
    const credential = await startRegistration(
      registrationOptions.value as Parameters<typeof startRegistration>[0]
    )

    const result = await api.auth.verifyRegistration(
      username.value,
      credential,
      props.invitationToken
    )

    emit('success', result.user, result.tokens)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed'
    error.value = message
    emit('error', message)
    // Reset options to allow retry
    registrationOptions.value = null
    viewState.value = 'valid'
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
</script>

<template>
  <div class="register-view">
    <div class="register-container">
      <!-- Loading state -->
      <template v-if="viewState === 'loading'">
        <div class="loading-state">
          <Icon name="hugeicons:loading-02" class="loading-icon" />
          <p>Validating invitation...</p>
        </div>
      </template>

      <!-- Invalid invitation -->
      <template v-else-if="viewState === 'invalid'">
        <div class="invalid-state">
          <Icon name="hugeicons:alert-circle" class="error-icon" />
          <h2 class="error-title">Invalid invitation</h2>
          <p class="error-description">
            This invitation link is invalid or has expired. Please contact your administrator for a new invitation.
          </p>
        </div>
      </template>

      <!-- Valid invitation - registration form -->
      <template v-else>
        <!-- Header -->
        <div class="header">
          <Icon name="hugeicons:user-add-01" class="header-icon" />
          <h1 class="title">Create your account</h1>
          <p class="subtitle">You've been invited to join Stina</p>
        </div>

        <!-- Registration form -->
        <form class="form" @submit.prevent="register">
          <!-- Pre-assigned username (read-only) -->
          <TextInput
            v-model="username"
            label="Username"
            :disabled="true"
            hint="Username assigned by administrator"
          />

          <!-- Role display -->
          <div class="role-display">
            <span class="role-label">Role</span>
            <span class="role-badge" :class="role">{{ role }}</span>
          </div>

          <!-- Optional display name -->
          <TextInput
            v-model="displayName"
            label="Display name (optional)"
            placeholder="Your name"
            hint="How you want to be displayed in the app"
            :disabled="!canEditDisplayName || isLoading"
            @input="clearError"
          />

          <!-- Error message -->
          <div v-if="error" class="error-message">
            <Icon name="hugeicons:alert-circle" />
            <span>{{ error }}</span>
          </div>

          <!-- Register button -->
          <SimpleButton
            type="primary"
            :disabled="isLoading"
            class="register-button"
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
              <span>{{ isLoading ? 'Registering...' : 'Register passkey' }}</span>
            </span>
          </SimpleButton>
        </form>

        <!-- Help text -->
        <p class="help-text">
          A passkey will be created on this device. You can use your fingerprint, face, or security key to sign in.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.register-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--theme-general-background);
}

.register-container {
  width: 100%;
  max-width: 400px;
  background: var(--theme-components-card-background, var(--theme-general-background));
  border: 1px solid var(--theme-general-border-color);
  border-radius: 1rem;
  padding: 2rem;
}

.loading-state,
.invalid-state {
  text-align: center;
  padding: 2rem;
}

.loading-icon {
  font-size: 2rem;
  color: var(--theme-general-color-muted);
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.error-icon {
  font-size: 3rem;
  color: var(--theme-general-color-danger, #dc2626);
  margin-bottom: 1rem;
}

.error-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0 0 0.5rem 0;
}

.error-description {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  margin: 0;
  line-height: 1.5;
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

.role-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.role-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--theme-general-color);
}

.role-badge {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 9999px;
  text-transform: capitalize;
}

.role-badge.admin {
  background: var(--theme-general-color-primary);
  color: white;
}

.role-badge.user {
  background: var(--theme-general-border-color);
  color: var(--theme-general-color);
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

.register-button {
  width: 100%;
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
