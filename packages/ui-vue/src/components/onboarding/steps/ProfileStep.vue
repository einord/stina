<script setup lang="ts">
/**
 * Profile setup step for onboarding.
 * Collects user's name and optional nickname.
 */
import { inject, onMounted } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import TextInput from '../../inputs/TextInput.vue'
import { useApi } from '../../../composables/useApi.js'
import { t } from '../../../composables/useI18n.js'

const onboarding = inject<UseOnboardingReturn>('onboarding')!
const api = useApi()

/**
 * Save profile to settings when leaving the step.
 */
async function saveProfile(): Promise<void> {
  if (!onboarding.firstName.value.trim()) return

  try {
    onboarding.setLoading(true)
    await api.settings.update({
      firstName: onboarding.firstName.value.trim(),
      nickname: onboarding.nickname.value.trim() || undefined,
    })
  } catch (err) {
    console.error('Failed to save profile:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    onboarding.setError(`Failed to save profile: ${message}`)
    // Don't block progress on error
  } finally {
    onboarding.setLoading(false)
  }
}

// Expose save function for parent to call
defineExpose({ saveProfile })
</script>

<template>
  <div class="profile-step">
    <h2 class="step-title">{{ t('onboarding.profile_title') }}</h2>
    <p class="step-subtitle">{{ t('onboarding.profile_subtitle') }}</p>

    <div class="form-fields">
      <TextInput
        v-model="onboarding.firstName.value"
        :label="t('onboarding.profile_first_name')"
        :placeholder="t('settings.profile.first_name_placeholder')"
        :disabled="onboarding.isLoading.value"
        required
      />

      <TextInput
        v-model="onboarding.nickname.value"
        :label="t('onboarding.profile_nickname')"
        :placeholder="t('settings.profile.nickname_placeholder')"
        :hint="t('onboarding.profile_nickname_hint')"
        :disabled="onboarding.isLoading.value"
      />
    </div>
  </div>
</template>

<style scoped>
.profile-step {
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

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 0.5rem;
}
</style>
