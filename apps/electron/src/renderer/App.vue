<script setup lang="ts">
import { ref, onMounted, watch, nextTick, inject } from 'vue'
import {
  AppShell,
  OnboardingView,
  ConnectionSetupView,
  LoginView,
  createLocalAuth,
  createAuth,
  provideAuth,
  useApi,
  type OnboardingMode,
  type UseAuthReturn,
} from '@stina/ui-vue'
import type { ConnectionConfig } from '@stina/core'

// Using Symbol.for() to match the symbol in main.ts
const connectionConfigKey = Symbol.for('stina:connectionConfig')

type AppState = 'loading' | 'connection-setup' | 'login' | 'onboarding' | 'ready'

const appState = ref<AppState>('loading')
const justCompletedOnboarding = ref(false)
const onboardingMode = ref<OnboardingMode>('full')
const api = useApi()

// Get the connection config that was provided in main.ts
const connectionConfig = inject<ConnectionConfig>(connectionConfigKey)

// Auth will be set based on connection mode
let auth: UseAuthReturn

// Determine auth mode based on connection config
if (connectionConfig?.mode === 'remote') {
  // Remote mode: use full auth with WebAuthn
  auth = createAuth()
} else {
  // Local mode (or unconfigured): use local auth with automatic admin user
  auth = createLocalAuth()
}
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

/**
 * Handle connection mode selection from ConnectionModeStep
 */
async function handleConnectionConfirm(config: ConnectionConfig) {
  try {
    const result = await window.electronAPI.connectionSetConfig(config)
    if (result.requiresRestart) {
      // Restart the app to apply the new connection mode
      await window.electronAPI.appRestart()
    }
  } catch (error) {
    console.error('Failed to save connection config:', error)
  }
}

/**
 * Handle switch to local mode from login view
 */
async function handleSwitchToLocal() {
  try {
    const result = await window.electronAPI.connectionSetConfig({ mode: 'local' })
    if (result.requiresRestart) {
      await window.electronAPI.appRestart()
    }
  } catch (error) {
    console.error('Failed to switch to local mode:', error)
  }
}

/**
 * Handle successful login in remote mode
 */
async function handleLoginSuccess(_user: unknown, tokens: { accessToken: string; refreshToken: string }) {
  try {
    // Set tokens directly in auth state
    localStorage.setItem('stina_access_token', tokens.accessToken)
    localStorage.setItem('stina_refresh_token', tokens.refreshToken)

    // Refresh to fetch user info and validate tokens
    // This is more efficient than full initialize as it skips the storage load
    await auth.refreshToken()

    appState.value = 'ready'
  } catch (error) {
    console.error('Failed to refresh after login:', error)
    appState.value = 'ready'
  }
}

onMounted(async () => {
  try {
    // Check if connection is configured
    // Note: connectionConfig is injected from main.ts which already fetched it
    if (!connectionConfig || connectionConfig.mode === 'unconfigured') {
      appState.value = 'connection-setup'
      return
    }

    // Remote mode: show login view
    if (connectionConfig.mode === 'remote') {
      // Initialize auth for remote mode
      await auth.initialize()

      // Check if already authenticated
      if (auth.isAuthenticated.value) {
        appState.value = 'ready'
      } else {
        appState.value = 'login'
      }
      return
    }

    // Local mode: continue with normal flow
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

  <!-- Connection setup (first time) -->
  <ConnectionSetupView
    v-else-if="appState === 'connection-setup'"
    @confirm="handleConnectionConfirm"
  />

  <!-- Login view (remote mode) -->
  <LoginView
    v-else-if="appState === 'login'"
    :web-url="connectionConfig?.webUrl ?? ''"
    :allow-local-mode="true"
    @success="handleLoginSuccess"
    @switch-to-local="handleSwitchToLocal"
  />

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
