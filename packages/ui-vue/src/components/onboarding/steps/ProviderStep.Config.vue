<script setup lang="ts">
/**
 * Provider configuration sub-step for onboarding.
 * Handles provider settings and connection testing.
 */
import { ref, inject, onMounted, computed, watch } from 'vue'
import type { UseOnboardingReturn } from '../composables/useOnboarding.js'
import type { ProviderInfo } from '../../../composables/useApi.js'
import type { ModelInfo } from '@stina/extension-api'
import ProviderConfigForm from '../../forms/ProviderConfigForm.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Select from '../../inputs/Select.vue'
import TextInput from '../../inputs/TextInput.vue'
import Icon from '../../common/Icon.vue'
import { useApi } from '../../../composables/useApi.js'
import { t } from '../../../composables/useI18n.js'

const props = defineProps<{
  /** The installed provider extension ID */
  providerId: string
}>()

const emit = defineEmits<{
  /** Emitted when config validation state changes */
  valid: [isValid: boolean]
  /** Emitted when user wants to go back to provider selection */
  back: []
}>()

const onboarding = inject<UseOnboardingReturn>('onboarding')!
const api = useApi()

// State
const provider = ref<ProviderInfo | null>(null)
const isTesting = ref(false)
const testSuccess = ref(false)
const testError = ref<string | null>(null)
const availableModels = ref<ModelInfo[]>([])
const selectedModel = ref('')
const modelName = ref('')

// Computed
const configTitle = computed(() => {
  if (provider.value) {
    return t('onboarding.provider_configure', { name: provider.value.name })
  }
  return t('onboarding.provider_configure', { name: '' })
})

const modelOptions = computed(() => {
  return availableModels.value.map((m) => ({
    value: m.id,
    label: m.name || m.id,
  }))
})

const isConfigValid = computed(() => {
  // Must have tested successfully and selected a model
  return testSuccess.value && selectedModel.value.length > 0
})

// Watch for validation changes
watch(isConfigValid, (valid) => {
  emit('valid', valid)
})

/**
 * Load provider info.
 */
async function loadProvider(): Promise<void> {
  try {
    const providers = await api.extensions.getProviders()
    provider.value = providers.find((p) => p.extensionId === props.providerId) ?? null

    // Initialize config with defaults
    if (provider.value?.defaultSettings) {
      onboarding.providerConfig.value = { ...provider.value.defaultSettings }
    }
  } catch (err) {
    console.error('Failed to load provider:', err)
  }
}

/**
 * Test connection with current config.
 */
async function testConnection(): Promise<void> {
  if (!provider.value || isTesting.value) return

  try {
    isTesting.value = true
    testSuccess.value = false
    testError.value = null

    const models = await api.extensions.getProviderModels(provider.value.id, {
      settings: onboarding.providerConfig.value,
    })

    availableModels.value = models
    testSuccess.value = true

    // Auto-select first model if available
    if (models.length > 0 && !selectedModel.value) {
      const firstModel = models[0]
      if (firstModel) {
        selectedModel.value = firstModel.id
        modelName.value = firstModel.name || firstModel.id
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    testError.value = message
    testSuccess.value = false
  } finally {
    isTesting.value = false
  }
}

/**
 * Save the model configuration.
 */
async function saveModelConfig(): Promise<void> {
  if (!provider.value || !selectedModel.value) return

  try {
    onboarding.setLoading(true)

    await api.modelConfigs.create({
      providerId: provider.value.id,
      providerExtensionId: props.providerId,
      modelId: selectedModel.value,
      name: modelName.value || selectedModel.value,
      settingsOverride: onboarding.providerConfig.value,
      isDefault: true,
    })
  } catch (err) {
    console.error('Failed to save model config:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    onboarding.setError(`Failed to save model configuration: ${message}`)
    // Continue anyway
  } finally {
    onboarding.setLoading(false)
  }
}

// Expose save for parent
defineExpose({ saveModelConfig })

// Watch model selection to update name
watch(selectedModel, (modelId) => {
  const model = availableModels.value.find((m) => m.id === modelId)
  if (model) {
    modelName.value = model.name || model.id
  }
})

onMounted(loadProvider)
</script>

<template>
  <div class="provider-config">
    <div class="config-header">
      <button type="button" class="back-link" @click="emit('back')">
        <Icon name="hugeicons:arrow-left-01" />
        <span>{{ t('onboarding.back') }}</span>
      </button>
      <h2 class="step-title">{{ configTitle }}</h2>
    </div>

    <template v-if="provider?.configSchema">
      <ProviderConfigForm
        v-model="onboarding.providerConfig.value"
        :schema="provider.configSchema"
        :disabled="isTesting || onboarding.isLoading.value"
      />
    </template>

    <!-- Test connection button -->
    <SimpleButton
      type="normal"
      :disabled="isTesting"
      @click="testConnection"
    >
      <span class="button-content">
        <Icon v-if="isTesting" name="hugeicons:loading-02" class="loading-icon" />
        <span>{{ isTesting ? t('onboarding.provider_testing') : t('onboarding.provider_test') }}</span>
      </span>
    </SimpleButton>

    <!-- Success message -->
    <div v-if="testSuccess" class="success-message">
      <Icon name="hugeicons:checkmark-circle-02" class="success-icon" />
      <span>{{ t('onboarding.provider_success') }}</span>
    </div>

    <!-- Error message -->
    <div v-if="testError" class="error-message">
      <Icon name="hugeicons:alert-circle" />
      <span>{{ t('onboarding.provider_error') }}: {{ testError }}</span>
    </div>

    <!-- Model selection (shown after successful test) -->
    <template v-if="testSuccess && availableModels.length > 0">
      <Select
        v-model="selectedModel"
        :label="t('settings.ai.model')"
        :options="modelOptions"
        :disabled="onboarding.isLoading.value"
      />

      <TextInput
        v-model="modelName"
        :label="t('settings.ai.model_name')"
        :placeholder="t('settings.ai.model_name_placeholder')"
        :hint="t('settings.ai.model_name_hint')"
        :disabled="onboarding.isLoading.value"
      />
    </template>
  </div>
</template>

<style scoped>
.provider-config {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.config-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  color: var(--theme-general-color-muted);
  font-size: 0.8125rem;
  cursor: pointer;
  padding: 0;
  align-self: flex-start;
  transition: color 0.15s ease;

  &:hover {
    color: var(--theme-general-color);
  }
}

.step-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--theme-general-color);
  margin: 0;
}

.button-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--theme-general-color-success, #22c55e);
  border-radius: 0.5rem;
  color: var(--theme-general-color-success, #22c55e);
  font-size: 0.875rem;
}

.success-icon {
  animation: checkmark 0.3s ease-out;
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

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes checkmark {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}
</style>
