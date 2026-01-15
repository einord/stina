<script setup lang="ts">
/**
 * Reusable button component for triggering WebAuthn passkey operations.
 * Emits success/error events and handles loading state during WebAuthn dialogs.
 */
import { ref } from 'vue'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'

const props = withDefaults(
  defineProps<{
    /** Operation mode: register or login */
    mode: 'register' | 'login'
    /** Button label text */
    label?: string
    /** WebAuthn options from server */
    options: unknown
    /** Whether the button is disabled */
    disabled?: boolean
  }>(),
  {
    label: undefined,
    disabled: false,
  }
)

const emit = defineEmits<{
  /** Emitted on successful WebAuthn operation */
  success: [credential: unknown]
  /** Emitted on WebAuthn error */
  error: [message: string]
}>()

const isLoading = ref(false)

/**
 * Get default label based on mode
 */
function getDefaultLabel(): string {
  return props.mode === 'register' ? 'Register passkey' : 'Login with passkey'
}

/**
 * Handle button click - start WebAuthn operation
 */
async function handleClick(): Promise<void> {
  if (isLoading.value || props.disabled || !props.options) {
    return
  }

  isLoading.value = true

  try {
    let credential: unknown

    if (props.mode === 'register') {
      credential = await startRegistration(
        props.options as Parameters<typeof startRegistration>[0]
      )
    } else {
      credential = await startAuthentication(
        props.options as Parameters<typeof startAuthentication>[0]
      )
    }

    emit('success', credential)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Passkey operation failed'
    emit('error', message)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <SimpleButton
    type="primary"
    :disabled="disabled || isLoading || !options"
    class="passkey-button"
    @click="handleClick"
  >
    <span class="passkey-button-content">
      <Icon
        v-if="isLoading"
        name="hugeicons:loading-02"
        class="loading-icon"
      />
      <Icon
        v-else
        name="hugeicons:finger-print"
        class="passkey-icon"
      />
      <span class="passkey-label">{{ label ?? getDefaultLabel() }}</span>
    </span>
  </SimpleButton>
</template>

<style scoped>
.passkey-button {
  min-width: 200px;
}

.passkey-button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.passkey-icon,
.loading-icon {
  font-size: 1.25rem;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.passkey-label {
  font-weight: 500;
}
</style>
