<script setup lang="ts">
/**
 * Master orchestrator for the onboarding wizard.
 * Displays a multi-step onboarding flow for new administrators.
 */
import { provide, onMounted, ref } from 'vue'
import { useOnboarding, type UseOnboardingReturn } from './composables/useOnboarding.js'
import OnboardingProgress from './OnboardingProgress.vue'
import OnboardingNavigation from './OnboardingNavigation.vue'
import LanguageStep from './steps/LanguageStep.vue'
import ProfileStep from './steps/ProfileStep.vue'
import ProviderStep from './steps/ProviderStep.vue'
import ExtensionsStep from './steps/ExtensionsStep.vue'
import CompleteStep from './steps/CompleteStep.vue'
import Icon from '../common/Icon.vue'
import { t } from '../../composables/useI18n.js'
import { useApi } from '../../composables/useApi.js'

const emit = defineEmits<{
  /** Emitted when onboarding is completed or skipped */
  complete: [conversationId: string | null]
}>()

const api = useApi()

// Create and provide onboarding state
const onboarding = useOnboarding()
provide<UseOnboardingReturn>('onboarding', onboarding)

// Step component refs
const profileStepRef = ref<InstanceType<typeof ProfileStep> | null>(null)
const providerStepRef = ref<InstanceType<typeof ProviderStep> | null>(null)
const extensionsStepRef = ref<InstanceType<typeof ExtensionsStep> | null>(null)

/**
 * Initialize onboarding by checking existing settings.
 * Steps will be skipped if user already has profile data.
 */
async function initializeOnboarding(): Promise<void> {
  try {
    const settings = await api.settings.get()
    onboarding.initialize({
      firstName: settings.firstName,
      nickname: settings.nickname,
    })
  } catch (err) {
    console.error('Failed to load settings for onboarding:', err)
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(
        'Some settings could not be loaded. All onboarding steps will be shown, and some features may not work as expected.'
      )
    }
    // Continue with all steps if settings can't be loaded
  }
}

onMounted(initializeOnboarding)

/**
 * Save step data before navigating away
 */
async function saveCurrentStepData(): Promise<void> {
  const currentStep = onboarding.currentStep.value

  // Save profile data when leaving step 2
  if (currentStep === 2 && profileStepRef.value?.saveProfile) {
    await profileStepRef.value.saveProfile()
  }

  // Save provider config when leaving step 3
  if (currentStep === 3 && providerStepRef.value?.saveConfig) {
    await providerStepRef.value.saveConfig()
  }

  // Install extensions when leaving step 4
  if (currentStep === 4 && extensionsStepRef.value?.installSelected) {
    await extensionsStepRef.value.installSelected()
  }
}

/**
 * Handle skip button click
 */
function handleSkip(): void {
  emit('complete', null)
}

/**
 * Handle navigation next/finish
 */
async function handleNext(): Promise<void> {
  // Save current step data before navigating
  await saveCurrentStepData()

  if (onboarding.isLastStep.value) {
    emit('complete', onboarding.createdConversationId.value)
  } else {
    onboarding.nextStep()
  }
}

/**
 * Handle navigation back
 */
function handleBack(): void {
  onboarding.previousStep()
}

/**
 * Handle completion from CompleteStep
 */
function handleComplete(conversationId: string | null): void {
  emit('complete', conversationId)
}
</script>

<template>
  <div class="onboarding-view">
    <div class="onboarding-container">
      <!-- Header with logo -->
      <div class="header">
        <Icon name="stina:head" class="header-icon" />
      </div>

      <!-- Progress indicator -->
      <OnboardingProgress
        :current-step="onboarding.displayStepIndex.value"
        :total-steps="onboarding.totalSteps.value"
      />

      <!-- Step content with transition -->
      <div class="step-wrapper">
        <Transition name="step" mode="out-in">
          <LanguageStep v-if="onboarding.currentStep.value === 1" :key="1" />
          <ProfileStep
            v-else-if="onboarding.currentStep.value === 2"
            ref="profileStepRef"
            :key="2"
          />
          <ProviderStep
            v-else-if="onboarding.currentStep.value === 3"
            ref="providerStepRef"
            :key="3"
          />
          <ExtensionsStep
            v-else-if="onboarding.currentStep.value === 4"
            ref="extensionsStepRef"
            :key="4"
          />
          <CompleteStep
            v-else-if="onboarding.currentStep.value === 5"
            :key="5"
            @complete="handleComplete"
          />
        </Transition>
      </div>

      <!-- Error display -->
      <div v-if="onboarding.error.value" class="error-message">
        <Icon name="hugeicons:alert-circle" />
        <span>{{ onboarding.error.value }}</span>
      </div>

      <!-- Navigation buttons (hidden on last step) -->
      <OnboardingNavigation
        v-if="!onboarding.isLastStep.value"
        :is-first-step="onboarding.isFirstStep.value"
        :can-go-next="onboarding.canGoNext.value"
        :is-loading="onboarding.isLoading.value"
        :is-last-step="onboarding.isLastStep.value"
        @skip="handleSkip"
        @back="handleBack"
        @next="handleNext"
      />
    </div>
  </div>
</template>

<style scoped>
.onboarding-view {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: var(--theme-general-background);
}

.onboarding-container {
  width: 100%;
  max-width: 480px;
  background: var(--theme-components-card-background, var(--theme-general-background));
  border: 1px solid var(--theme-general-border-color);
  border-radius: 1rem;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.header {
  text-align: center;
}

.header-icon {
  font-size: 4rem;
  color: var(--theme-general-color-muted);
}

.step-wrapper {
  min-height: 280px;
  display: flex;
  flex-direction: column;
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

/* Step transitions */
.step-enter-active {
  transition: all 0.3s ease-out;
}

.step-leave-active {
  transition: all 0.2s ease-in;
}

.step-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.step-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}
</style>
