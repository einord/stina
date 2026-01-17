<script setup lang="ts">
/**
 * Completion step for onboarding.
 * Shows welcome message before transitioning to ChatView.
 * ChatView will automatically start a new conversation with Stina's greeting.
 */
import { inject, computed } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'
import { t } from '../../../composables/useI18n.js'

const emit = defineEmits<{
  /** Emitted when user clicks the "Meet Stina" button */
  complete: [conversationId: string | null]
}>()

const onboarding = inject<UseOnboardingReturn>('onboarding')!

// Computed
const displayName = computed(() => {
  return onboarding.nickname.value || onboarding.firstName.value || ''
})

const welcomeSubtitle = computed(() => {
  if (displayName.value) {
    return t('onboarding.complete_subtitle', { name: displayName.value })
  }
  return t('onboarding.complete_subtitle_no_name')
})

/**
 * Handle "Meet Stina" button click.
 * Emits null to let ChatView create the conversation with Stina's greeting.
 */
function handleMeetStina(): void {
  emit('complete', null)
}
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
      class="meet-button"
      @click="handleMeetStina"
    >
      {{ t('onboarding.complete_button') }}
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
</style>
