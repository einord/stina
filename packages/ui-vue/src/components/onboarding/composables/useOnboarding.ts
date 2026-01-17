import { ref, computed } from 'vue'

export enum OnboardingStepEnum {
  Language = 1,
  Profile = 2,
  Provider = 3,
  Extensions = 4,
  Complete = 5,
}

export type OnboardingStep = 1 | 2 | 3 | 4 | 5

/** All possible steps in order */
const ALL_STEPS: OnboardingStep[] = [1, 2, 3, 4, 5]

export interface OnboardingState {
  currentStep: OnboardingStep
  language: 'sv' | 'en'
  firstName: string
  nickname: string
  selectedProviderId: string | null
  providerConfig: Record<string, unknown>
  providerConfigValid: boolean
  installedProviderId: string | null
  selectedExtensionIds: string[]
  isLoading: boolean
  error: string | null
  createdConversationId: string | null
  skippedSteps: OnboardingStep[]
}

export interface ExistingSettings {
  firstName?: string
  nickname?: string
}

/** Onboarding mode - 'full' for new systems, 'profile-only' for new users in existing systems */
export type OnboardingMode = 'full' | 'profile-only'

/**
 * State management composable for the onboarding wizard.
 * Manages all onboarding data and navigation between steps.
 */
export function useOnboarding() {
  // State
  const currentStep = ref<OnboardingStep>(1)
  const language = ref<'sv' | 'en'>(detectLanguage())
  const firstName = ref('')
  const nickname = ref('')
  const selectedProviderId = ref<string | null>(null)
  const providerConfig = ref<Record<string, unknown>>({})
  const providerConfigValid = ref(false)
  const installedProviderId = ref<string | null>(null)
  const selectedExtensionIds = ref<string[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const createdConversationId = ref<string | null>(null)
  const skippedSteps = ref<OnboardingStep[]>([])

  // Computed
  /** List of active (non-skipped) steps */
  const activeSteps = computed(() =>
    ALL_STEPS.filter((step) => !skippedSteps.value.includes(step))
  )

  /** Current step position among active steps (1-based, for progress display) */
  const displayStepIndex = computed(() => {
    const index = activeSteps.value.indexOf(currentStep.value)
    return index >= 0 ? index + 1 : 1
  })

  const totalSteps = computed(() => activeSteps.value.length)
  const isFirstStep = computed(() => {
    const steps = activeSteps.value
    if (steps.length === 0) {
      return false
    }
    return currentStep.value === steps[0]
  })
  const isLastStep = computed(() => {
    const steps = activeSteps.value
    if (steps.length === 0) {
      return false
    }
    return currentStep.value === steps[steps.length - 1]
  })

  const canGoNext = computed(() => {
    // Defensive check: ensure current step is in activeSteps
    const steps = activeSteps.value
    if (!steps.includes(currentStep.value)) {
      return false
    }

    switch (currentStep.value) {
      case 1:
        // Language selection - always valid
        return true
      case 2:
        // Profile - firstName is required
        return firstName.value.trim().length > 0
      case 3:
        // Provider - must have installed and configured a provider
        return installedProviderId.value !== null && providerConfigValid.value
      case 4:
        // Extensions - always valid (selection is optional)
        return true
      case 5:
        // Complete - always valid
        return true
      default:
        return false
    }
  })

  /**
   * Detect language from browser settings.
   */
  function detectLanguage(): 'sv' | 'en' {
    const browserLang = navigator.language.toLowerCase()
    if (browserLang.startsWith('sv')) {
      return 'sv'
    }
    return 'en'
  }

  /**
   * Navigate to the next active step.
   */
  function nextStep(): void {
    const currentIndex = activeSteps.value.indexOf(currentStep.value)
    if (currentIndex >= 0 && currentIndex < activeSteps.value.length - 1) {
      const nextStepValue = activeSteps.value[currentIndex + 1]
      if (nextStepValue !== undefined) {
        currentStep.value = nextStepValue
        error.value = null
      }
    }
  }

  /**
   * Navigate to the previous active step.
   */
  function previousStep(): void {
    const currentIndex = activeSteps.value.indexOf(currentStep.value)
    if (currentIndex > 0) {
      const prevStepValue = activeSteps.value[currentIndex - 1]
      if (prevStepValue !== undefined) {
        currentStep.value = prevStepValue
        error.value = null
      }
    }
  }

  /**
   * Go to a specific step (must be an active step).
   */
  function goToStep(step: OnboardingStep): void {
    if (activeSteps.value.includes(step)) {
      currentStep.value = step
      error.value = null
    }
  }

  /**
   * Initialize onboarding with existing settings and mode.
   * Determines which steps should be skipped based on existing data and mode.
   * @param settings - Existing user settings
   * @param mode - 'full' for new systems, 'profile-only' for new users in existing systems
   */
  function initialize(settings: ExistingSettings, mode: OnboardingMode = 'full'): void {
    const stepsToSkip: OnboardingStep[] = []

    if (mode === 'profile-only') {
      // In profile-only mode, skip everything except Profile (2) and Complete (5)
      stepsToSkip.push(1, 3, 4) // Skip Language, Provider, Extensions
      // Start at Profile step
      currentStep.value = 2
    } else {
      // In full mode, skip profile step if firstName or nickname is already set
      if (settings.firstName || settings.nickname) {
        stepsToSkip.push(2)
      }
    }

    // Pre-populate values if they exist
    if (settings.firstName) firstName.value = settings.firstName
    if (settings.nickname) nickname.value = settings.nickname

    skippedSteps.value = stepsToSkip
  }

  /**
   * Set loading state.
   */
  function setLoading(loading: boolean): void {
    isLoading.value = loading
  }

  /**
   * Set error message.
   */
  function setError(errorMessage: string | null): void {
    error.value = errorMessage
  }

  /**
   * Reset all state.
   */
  function reset(): void {
    currentStep.value = 1
    language.value = detectLanguage()
    firstName.value = ''
    nickname.value = ''
    selectedProviderId.value = null
    providerConfig.value = {}
    providerConfigValid.value = false
    installedProviderId.value = null
    selectedExtensionIds.value = []
    isLoading.value = false
    error.value = null
    createdConversationId.value = null
    skippedSteps.value = []
  }

  /**
   * Get current state snapshot.
   */
  function getState(): OnboardingState {
    return {
      currentStep: currentStep.value,
      language: language.value,
      firstName: firstName.value,
      nickname: nickname.value,
      selectedProviderId: selectedProviderId.value,
      providerConfig: providerConfig.value,
      providerConfigValid: providerConfigValid.value,
      installedProviderId: installedProviderId.value,
      selectedExtensionIds: selectedExtensionIds.value,
      isLoading: isLoading.value,
      error: error.value,
      createdConversationId: createdConversationId.value,
      skippedSteps: skippedSteps.value,
    }
  }

  return {
    // State
    currentStep,
    language,
    firstName,
    nickname,
    selectedProviderId,
    providerConfig,
    providerConfigValid,
    installedProviderId,
    selectedExtensionIds,
    isLoading,
    error,
    createdConversationId,
    skippedSteps,

    // Computed
    isFirstStep,
    isLastStep,
    totalSteps,
    canGoNext,
    displayStepIndex,

    // Methods
    initialize,
    nextStep,
    previousStep,
    goToStep,
    setLoading,
    setError,
    reset,
    getState,
  }
}

export type UseOnboardingReturn = ReturnType<typeof useOnboarding>
