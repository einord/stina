<script setup lang="ts">
/**
 * Completion step for onboarding.
 * Shows welcome message and creates first conversation.
 */
import { ref, inject, onMounted, computed } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'
import { useApi } from '../../../composables/useApi.js'
import { t } from '../../../composables/useI18n.js'

const emit = defineEmits<{
  /** Emitted when user clicks the "Meet Stina" button */
  complete: [conversationId: string | null]
}>()

const onboarding = inject<UseOnboardingReturn>('onboarding')!
const api = useApi()

// State
const isCreatingConversation = ref(false)
const conversationReady = ref(false)

// Computed
const displayName = computed(() => {
  return onboarding.nickname.value || onboarding.firstName.value || ''
})

const welcomeSubtitle = computed(() => {
  if (displayName.value) {
    return t('onboarding.complete_subtitle', { name: displayName.value })
  }
  return t('onboarding.complete_subtitle', { name: '' }).replace(', ', '')
})

/**
 * Create initial conversation and send greeting.
 */
async function createInitialConversation(): Promise<void> {
  if (isCreatingConversation.value) return

  try {
    isCreatingConversation.value = true

    // Create a new conversation
    const conversationId = crypto.randomUUID()
    const conversation = await api.chat.createConversation(
      conversationId,
      undefined,
      new Date().toISOString()
    )

    onboarding.createdConversationId.value = conversation.id

    // Send empty message to trigger Stina's greeting
    await api.chat.sendMessage(conversation.id, '')

    conversationReady.value = true
  } catch (err) {
    console.error('Failed to create conversation:', err)
    // Still allow completion even if conversation creation fails
    conversationReady.value = true
  } finally {
    isCreatingConversation.value = false
  }
}

/**
 * Handle "Meet Stina" button click.
 */
function handleMeetStina(): void {
  emit('complete', onboarding.createdConversationId.value)
}

onMounted(createInitialConversation)
</script>

<template>
  <div class="complete-step">
    <div class="success-animation">
      <div class="checkmark-circle">
        <Icon name="hugeicons:checkmark-circle-02" class="checkmark-icon" />
      </div>
    </div>

    <h2 class="step-title">{{ t('onboarding.complete_title') }}</h2>
    <p class="step-subtitle">{{ welcomeSubtitle }}</p>
    <p class="step-message">{{ t('onboarding.complete_message') }}</p>

    <SimpleButton
      type="primary"
      :disabled="isCreatingConversation"
      class="meet-button"
      @click="handleMeetStina"
    >
      <span class="button-content">
        <Icon v-if="isCreatingConversation" name="hugeicons:loading-02" class="loading-icon" />
        <span>
          {{ isCreatingConversation ? t('onboarding.complete_loading') : t('onboarding.complete_button') }}
        </span>
      </span>
    </SimpleButton>
  </div>
</template>

<style scoped>
.complete-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
  padding: 1rem 0;
}

.success-animation {
  margin-bottom: 0.5rem;
}

.checkmark-circle {
  width: 4rem;
  height: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pop-in 0.4s ease-out;
}

.checkmark-icon {
  font-size: 4rem;
  color: var(--theme-general-color-success, #22c55e);
}

.step-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0;
}

.step-subtitle {
  font-size: 1rem;
  color: var(--theme-general-color);
  margin: 0;
}

.step-message {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  margin: 0;
}

.meet-button {
  margin-top: 1rem;
  min-width: 160px;
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

@keyframes pop-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
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
</style>
