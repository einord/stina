<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  AppShell,
  SetupView,
  LoginView,
  createAuth,
  provideAuth,
  useApi,
} from '@stina/ui-vue'

type AppState = 'loading' | 'setup' | 'login' | 'authenticated'

const appState = ref<AppState>('loading')
const api = useApi()

// Create and provide auth
const auth = createAuth()
provideAuth(auth)

onMounted(async () => {
  try {
    // 1. Try to initialize auth from storage
    await auth.initialize()

    if (auth.isAuthenticated.value) {
      // User already logged in
      appState.value = 'authenticated'
      return
    }

    // 2. Check setup status
    const status = await api.auth.getSetupStatus()

    if (status.isFirstUser && !status.setupCompleted) {
      // First time setup needed
      appState.value = 'setup'
    } else {
      // Setup done, user needs to login
      appState.value = 'login'
    }
  } catch (error) {
    console.error('Auth initialization failed:', error)
    // On error, show login (setup check might have failed)
    appState.value = 'login'
  }
})

function handleSetupComplete() {
  // After setup, user is automatically logged in
  appState.value = 'authenticated'
}

function handleLoginSuccess() {
  appState.value = 'authenticated'
}

function handleLoginError(message: string) {
  console.error('Login failed:', message)
}
</script>

<template>
  <!-- Loading state -->
  <div v-if="appState === 'loading'" class="app-loading">
    <div class="loading-spinner"></div>
    <p>Loading...</p>
  </div>

  <!-- Setup view (first time) -->
  <SetupView
    v-else-if="appState === 'setup'"
    @complete="handleSetupComplete"
  />

  <!-- Login view -->
  <LoginView
    v-else-if="appState === 'login'"
    title="Welcome to Stina"
    subtitle="Sign in with your passkey to continue"
    @success="handleLoginSuccess"
    @error="handleLoginError"
  />

  <!-- Main app -->
  <AppShell v-else-if="appState === 'authenticated'" />
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
