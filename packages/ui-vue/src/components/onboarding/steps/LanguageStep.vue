<script setup lang="ts">
/**
 * Language selection step for onboarding.
 * Allows users to choose their preferred language.
 */
import { inject, watch } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import Select from '../../inputs/Select.vue'
import { t, setLang } from '../../../composables/useI18n.js'

const onboarding = inject<UseOnboardingReturn>('onboarding')!

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'sv', label: 'Svenska' },
]

// Update language immediately when selection changes
watch(
  () => onboarding.language.value,
  (newLang) => {
    setLang(newLang)
  },
  { immediate: true }
)
</script>

<template>
  <div class="language-step">
    <h2 class="step-title">{{ t('onboarding.language_title') }}</h2>
    <p class="step-subtitle">{{ t('onboarding.language_subtitle') }}</p>

    <div class="language-select-wrapper">
      <Select
        v-model="onboarding.language.value"
        :options="languageOptions"
        :disabled="onboarding.isLoading.value"
      />
    </div>
  </div>
</template>

<style scoped>
.language-step {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0;
  text-align: center;
}

.step-subtitle {
  font-size: 0.875rem;
  color: var(--theme-general-color-muted);
  margin: 0;
  text-align: center;
}

.language-select-wrapper {
  margin-top: 1rem;
  max-width: 280px;
  align-self: center;
}
</style>
