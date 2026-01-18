<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import {
  AppShell,
  OnboardingView,
  createLocalAuth,
  provideAuth,
  useApi,
  type OnboardingMode,
} from '@stina/ui-vue'

type AppState = 'loading' | 'onboarding' | 'ready'

const appState = ref<AppState>('loading')
const justCompletedOnboarding = ref(false)
const onboardingMode = ref<OnboardingMode>('full')
const api = useApi()

// Create and provide local auth (Electron uses local mode with automatic admin user)
const auth = createLocalAuth()
provideAuth(auth)

/**
 * Reset justCompletedOnboarding flag after it has been used
 */
watch(appState, (newState) => {
  if (newState === 'ready' && justCompletedOnboarding.value) {
    nextTick(() => {
      justCompletedOnboarding.value = false
    })
  }
})

/**
 * Check if user needs profile-only onboarding
 * Returns true if user has no firstName AND no nickname set
 */
async function needsProfileOnboarding(): Promise<boolean> {
  try {
    const settings = await api.settings.get()
    return !settings.firstName && !settings.nickname
  } catch (err) {
    console.error('Failed to check profile settings:', err)
    return false
  }
}

onMounted(async () => {
  try {
    // Initialize local auth (loads the default admin user)
    await auth.initialize()

    // Check if any extensions are installed
    let installed: unknown[] = []
    try {
      const result = await api.extensions.getInstalled()
      installed = result as unknown[]
    } catch (err) {
      console.error('Failed to check installed extensions:', err)
    }

    // If no extensions installed, show full onboarding
    if (installed.length === 0) {
      onboardingMode.value = 'full'
      appState.value = 'onboarding'
      return
    }

    // Check if user needs profile-only onboarding
    if (await needsProfileOnboarding()) {
      onboardingMode.value = 'profile-only'
      appState.value = 'onboarding'
      return
    }

    // All good, show main app
    appState.value = 'ready'
  } catch (error) {
    console.error('Initialization failed:', error)
    // On error, still show the main app
    appState.value = 'ready'
  }
})

/**
 * Handle onboarding completion
 */
function handleOnboardingComplete(_conversationId: string | null) {
  if (onboardingMode.value === 'full') {
    justCompletedOnboarding.value = true
  }
  appState.value = 'ready'
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="appState === 'loading'" class="app-loading">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>

  <!-- Onboarding view -->
  <OnboardingView
    v-else-if="appState === 'onboarding'"
    :mode="onboardingMode"
    @complete="handleOnboardingComplete"
  />

  <!-- Main app -->
  <AppShell
    v-else-if="appState === 'ready'"
    :start-fresh-conversation="justCompletedOnboarding"
  />
</template>

<style scoped>
.app-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
  color: var(--theme-general-color, #666);
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--theme-general-border-color, #ddd);
  border-top-color: var(--theme-general-color-primary, #007bff);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
