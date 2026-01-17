<script setup lang="ts">
/**
 * Navigation buttons for the onboarding wizard.
 * Provides Skip, Back, and Next/Finish buttons.
 */
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'
import { t } from '../../composables/useI18n.js'

defineProps<{
  /** Whether this is the first active step */
  isFirstStep: boolean
  /** Whether user can proceed to next step */
  canGoNext: boolean
  /** Whether an operation is in progress */
  isLoading: boolean
  /** Whether this is the last step */
  isLastStep: boolean
}>()

const emit = defineEmits<{
  /** Emitted when skip button is clicked */
  skip: []
  /** Emitted when back button is clicked */
  back: []
  /** Emitted when next/finish button is clicked */
  next: []
}>()
</script>

<template>
  <div class="onboarding-navigation">
    <!-- Skip button -->
    <button
      type="button"
      class="skip-button"
      :disabled="isLoading"
      @click="emit('skip')"
    >
      {{ t('onboarding.skip') }}
    </button>

    <div class="main-buttons">
      <!-- Back button (visible if not on first step) -->
      <button
        v-if="!isFirstStep"
        type="button"
        class="back-button"
        :disabled="isLoading"
        @click="emit('back')"
      >
        {{ t('onboarding.back') }}
      </button>

      <!-- Next/Finish button -->
      <SimpleButton
        type="primary"
        class="next-button"
        :disabled="!canGoNext || isLoading"
        @click="emit('next')"
      >
        <span class="button-content">
          <Icon v-if="isLoading" name="hugeicons:loading-02" class="loading-icon" />
          <span>{{ isLastStep ? t('onboarding.finish') : t('onboarding.next') }}</span>
        </span>
      </SimpleButton>
    </div>
  </div>
</template>

<style scoped>
.onboarding-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
}

.skip-button {
  background: none;
  border: none;
  color: var(--theme-general-color-muted);
  font-size: 0.875rem;
  cursor: pointer;
  padding: 0.5rem;
  transition: color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--theme-general-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.main-buttons {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.back-button {
  background: none;
  border: none;
  color: var(--theme-general-color-muted);
  font-size: 0.9375rem;
  cursor: pointer;
  padding: 0.75em 1em;
  transition: color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--theme-general-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.next-button {
  border: 1px solid var(--theme-general-color-primary) !important;
}

.button-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
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
</style>
