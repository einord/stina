<script setup lang="ts">
/**
 * AI Provider selection step for onboarding.
 * Shows available AI providers and handles installation and configuration.
 */
import { ref, inject, onMounted, computed } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import type { ExtensionListItem } from '@stina/extension-installer'
import LargeButton from '../../buttons/LargeButton.vue'
import Icon from '../../common/Icon.vue'
import ProviderStepConfig from './ProviderStep.Config.vue'
import { useApi } from '../../../composables/useApi.js'
import { t } from '../../../composables/useI18n.js'

const onboarding = inject<UseOnboardingReturn>('onboarding')!
const api = useApi()

// State
const availableProviders = ref<ExtensionListItem[]>([])
const isInstalling = ref(false)
const showConfig = ref(false)
const configRef = ref<InstanceType<typeof ProviderStepConfig> | null>(null)

// Computed
const personalizedTitle = computed(() => {
  const name = onboarding.firstName.value || onboarding.nickname.value
  if (name) {
    return t('onboarding.provider_title', { name })
  }
  return t('onboarding.provider_title_no_name')
})

/**
 * Load available AI providers from registry.
 */
async function loadProviders(): Promise<void> {
  try {
    const available = await api.extensions.getAvailable()
    // Filter to only AI providers
    availableProviders.value = available.filter((ext) => ext.categories.includes('ai-provider'))
  } catch (err) {
    console.error('Failed to load providers:', err)
    onboarding.setError(t('common.error'))
  }
}

/**
 * Handle provider selection and installation.
 */
async function selectProvider(provider: ExtensionListItem): Promise<void> {
  if (isInstalling.value) return

  try {
    isInstalling.value = true
    onboarding.selectedProviderId.value = provider.id

    // Install the provider extension
    const result = await api.extensions.install(provider.id)

    if (result.success) {
      onboarding.installedProviderId.value = provider.id
      showConfig.value = true
    } else {
      onboarding.setError(result.error ?? t('extensions.install_error', { error: 'Unknown error' }))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    onboarding.setError(t('extensions.install_error', { error: message }))
  } finally {
    isInstalling.value = false
  }
}

/**
 * Handle config validation change.
 */
function handleConfigValid(valid: boolean): void {
  onboarding.providerConfigValid.value = valid
}

/**
 * Go back to provider selection.
 */
function handleBackToSelection(): void {
  showConfig.value = false
  onboarding.providerConfigValid.value = false
}

/**
 * Save provider configuration (called by parent)
 */
async function saveConfig(): Promise<void> {
  if (configRef.value?.saveModelConfig) {
    await configRef.value.saveModelConfig()
  }
}

// Expose save function for parent to call
defineExpose({ saveConfig })

onMounted(loadProviders)
</script>

<template>
  <div class="provider-step">
    <!-- Provider configuration view -->
    <template v-if="showConfig && onboarding.installedProviderId.value">
      <ProviderStepConfig
        ref="configRef"
        :provider-id="onboarding.installedProviderId.value"
        @valid="handleConfigValid"
        @back="handleBackToSelection"
      />
    </template>

    <!-- Provider selection view -->
    <template v-else>
      <h2 class="step-title">{{ personalizedTitle }}</h2>
      <p class="step-subtitle">{{ t('onboarding.provider_subtitle') }}</p>

      <div class="providers-list">
        <LargeButton
          v-for="provider in availableProviders"
          :key="provider.id"
          :title="provider.name"
          :description="provider.description"
          :disabled="isInstalling"
          :selected="onboarding.selectedProviderId.value === provider.id"
          @click="selectProvider(provider)"
        >
          <template #icon>
            <Icon
              v-if="isInstalling && onboarding.selectedProviderId.value === provider.id"
              name="hugeicons:loading-02"
              class="loading-icon"
            />
          </template>
        </LargeButton>

        <p v-if="availableProviders.length === 0 && !onboarding.isLoading.value" class="no-providers">
          {{ t('settings.ai.no_providers_hint') }}
        </p>
      </div>

      <p class="hint-text">{{ t('onboarding.provider_hint') }}</p>
    </template>
  </div>
</template>

<style scoped>
.provider-step {
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

.providers-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.no-providers {
  text-align: center;
  color: var(--theme-general-color-muted);
  font-size: 0.875rem;
  margin: 1rem 0;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--theme-general-color-muted);
  text-align: center;
  margin: 0.5rem 0 0 0;
}

.loading-icon {
  animation: spin 1s linear infinite;
  font-size: 1.25rem;
  color: var(--theme-general-color-muted);
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
