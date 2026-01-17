<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  AppShell,
  SetupView,
  LoginView,
  RegisterView,
  OnboardingView,
  createAuth,
  provideAuth,
  useApi,
  type User,
  type TokenPair,
  type OnboardingMode,
} from '@stina/ui-vue'

type AppState = 'loading' | 'setup' | 'onboarding' | 'login' | 'register' | 'authenticated'

const appState = ref<AppState>('loading')
const invitationToken = ref<string | null>(null)
const justCompletedOnboarding = ref(false)
const onboardingMode = ref<OnboardingMode>('full')
const api = useApi()

// Create and provide auth
const auth = createAuth()
provideAuth(auth)

/**
 * Check if URL contains a registration route with token
 */
function getRegistrationToken(): string | null {
  const url = new URL(window.location.href)
  if (url.pathname === '/register') {
    return url.searchParams.get('token')
  }
  return null
}

/**
 * Clear the registration URL from browser history
 */
function clearRegistrationUrl(): void {
  window.history.replaceState({}, '', '/')
}

/**
 * Check if user needs profile-only onboarding (new user in existing system)
 * Returns true if user has no firstName AND no nickname set
 */
async function needsProfileOnboarding(): Promise<boolean> {
  try {
    const settings = await api.settings.get()
    // User needs profile onboarding if both firstName and nickname are missing
    return !settings.firstName && !settings.nickname
  } catch (err) {
    console.error('Failed to check profile settings:', err)
    return false
  }
}

onMounted(async () => {
  try {
    // 1. Check for registration token in URL
    const token = getRegistrationToken()
    if (token) {
      invitationToken.value = token
      appState.value = 'register'
      return
    }

    // 2. Try to initialize auth from storage
    await auth.initialize()

    if (auth.isAuthenticated.value) {
      // User already logged in - check if onboarding is needed
      const user = auth.user.value
      if (user?.role === 'admin') {
        // Retry the extensions check a limited number of times to handle transient failures
        let installed: unknown[] | null = null
        let checkSucceeded = false
        const maxAttempts = 2
        for (let attempt = 0; attempt < maxAttempts && !checkSucceeded; attempt++) {
          try {
            const result = await api.extensions.getInstalled()
            installed = result as unknown[]
            checkSucceeded = true
          } catch (err) {
            console.error(
              `Failed to check installed extensions (attempt ${attempt + 1}/${maxAttempts}):`,
              err
            )
            if (
              attempt === maxAttempts - 1 &&
              typeof window !== 'undefined' &&
              typeof window.alert === 'function'
            ) {
              window.alert(
                'Unable to verify installed extensions. Onboarding may not be shown correctly.'
              )
            }
          }
        }
        if (checkSucceeded && installed && installed.length === 0) {
          // No extensions installed - show full onboarding for admin
          onboardingMode.value = 'full'
          appState.value = 'onboarding'
          return
        }
      }

      // Check if user needs profile-only onboarding (new user without profile)
      if (await needsProfileOnboarding()) {
        onboardingMode.value = 'profile-only'
        appState.value = 'onboarding'
        return
      }

      appState.value = 'authenticated'
      return
    }

    // 3. Check setup status
    const status = await api.auth.getSetupStatus()

    if (status.isFirstUser) {
      // No users exist - need to register first admin
      // SetupView handles both domain setup and registration
      appState.value = 'setup'
    } else {
      // Users exist, show login
      appState.value = 'login'
    }
  } catch (error) {
    console.error('Auth initialization failed:', error)
    // On error, show login (setup check might have failed)
    appState.value = 'login'
  }
})

/**
 * Handle onboarding completion
 */
function handleOnboardingComplete(_conversationId: string | null) {
  // Only start fresh conversation after full onboarding, not profile-only
  if (onboardingMode.value === 'full') {
    justCompletedOnboarding.value = true
  }
  // Onboarding complete, go to authenticated state
  appState.value = 'authenticated'
}

async function handleSetupComplete(user: User, tokens: TokenPair) {
  // Store tokens in localStorage (same keys as useAuth)
  localStorage.setItem('stina_access_token', tokens.accessToken)
  localStorage.setItem('stina_refresh_token', tokens.refreshToken)
  localStorage.setItem('stina_user', JSON.stringify(user))

  // Re-initialize auth to pick up the new tokens from storage
  await auth.initialize()
  appState.value = 'authenticated'
}

async function handleLoginSuccess(user: User, tokens: TokenPair) {
  // Store tokens in localStorage (same keys as useAuth)
  localStorage.setItem('stina_access_token', tokens.accessToken)
  localStorage.setItem('stina_refresh_token', tokens.refreshToken)
  localStorage.setItem('stina_user', JSON.stringify(user))

  // Re-initialize auth to pick up the new tokens from storage
  await auth.initialize()

  // Check if user needs profile-only onboarding (new user without profile)
  if (await needsProfileOnboarding()) {
    onboardingMode.value = 'profile-only'
    appState.value = 'onboarding'
    return
  }

  appState.value = 'authenticated'
}

function handleLoginError(message: string) {
  console.error('Login failed:', message)
}

async function handleRegisterSuccess(user: User, tokens: TokenPair) {
  // Store tokens in localStorage (same keys as useAuth)
  localStorage.setItem('stina_access_token', tokens.accessToken)
  localStorage.setItem('stina_refresh_token', tokens.refreshToken)
  localStorage.setItem('stina_user', JSON.stringify(user))

  // Clear the registration URL
  clearRegistrationUrl()
  invitationToken.value = null

  // Re-initialize auth to pick up the new tokens from storage
  await auth.initialize()

  // Check if user needs profile-only onboarding (new user without profile)
  if (await needsProfileOnboarding()) {
    onboardingMode.value = 'profile-only'
    appState.value = 'onboarding'
    return
  }

  appState.value = 'authenticated'
}

function handleRegisterError(message: string) {
  console.error('Registration failed:', message)
}

function handleInvalidInvitation() {
  // Clear URL and fall back to login
  clearRegistrationUrl()
  invitationToken.value = null
  appState.value = 'login'
}

function handleLogout() {
  // User logged out, show login screen
  appState.value = 'login'
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
    @redirect-to-login="appState = 'login'"
  />

  <!-- Onboarding view (full for new systems, profile-only for new users) -->
  <OnboardingView
    v-else-if="appState === 'onboarding'"
    :mode="onboardingMode"
    @complete="handleOnboardingComplete"
  />

  <!-- Login view -->
  <LoginView
    v-else-if="appState === 'login'"
    title="Welcome to Stina"
    subtitle="Sign in with your passkey to continue"
    @success="handleLoginSuccess"
    @error="handleLoginError"
  />

  <!-- Register view (invitation link) -->
  <RegisterView
    v-else-if="appState === 'register' && invitationToken"
    :invitation-token="invitationToken"
    @success="handleRegisterSuccess"
    @error="handleRegisterError"
    @invalid-invitation="handleInvalidInvitation"
  />

  <!-- Main app -->
  <AppShell
    v-else-if="appState === 'authenticated'"
    :start-fresh-conversation="justCompletedOnboarding"
    @logout="handleLogout"
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
