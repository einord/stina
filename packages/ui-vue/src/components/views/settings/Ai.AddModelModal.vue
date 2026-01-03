<script setup lang="ts">
/**
 * Modal for adding a new AI model configuration.
 * Allows selecting a provider, model, and setting a custom name.
 */
import { ref, watch, computed } from 'vue'
import type { ModelInfo } from '@stina/extension-api'
import { useApi, type ProviderInfo } from '../../../composables/useApi.js'
import Modal from '../../common/Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'
import Combobox from '../../common/Combobox.vue'

const open = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  saved: []
}>()

const api = useApi()

// Form state
const name = ref('')
const selectedProviderId = ref('')
const selectedModelId = ref('')
const isDefault = ref(false)
const url = ref('')

// Default URL for Ollama provider
const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

// Data state
const providers = ref<ProviderInfo[]>([])
const models = ref<ModelInfo[]>([])
const loadingProviders = ref(false)
const loadingModels = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const selectedProvider = computed(() =>
  providers.value.find((p) => p.id === selectedProviderId.value)
)

// Check if the selected provider needs URL configuration (e.g., Ollama)
const needsUrlConfig = computed(() => {
  // For now, Ollama is the only provider that needs URL config
  return selectedProviderId.value === 'ollama'
})

const selectedModel = computed(() =>
  models.value.find((m) => m.id === selectedModelId.value)
)

// Convert models to combobox options
const modelOptions = computed(() =>
  models.value.map((m) => ({
    value: m.id,
    label: m.name,
    description: m.description,
  }))
)

const canSave = computed(() =>
  name.value.trim() && selectedProviderId.value && selectedModelId.value && !saving.value
)

/**
 * Load available providers when modal opens
 */
async function loadProviders() {
  loadingProviders.value = true
  error.value = null
  try {
    providers.value = await api.extensions.getProviders()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load providers'
    console.error('Failed to load providers:', err)
  } finally {
    loadingProviders.value = false
  }
}

/**
 * Load models when provider is selected
 */
async function loadModels() {
  if (!selectedProviderId.value) {
    models.value = []
    return
  }

  loadingModels.value = true
  error.value = null
  try {
    // Build options with settings (URL for Ollama)
    const options: { settings?: { url?: string } } = {}
    if (needsUrlConfig.value && url.value) {
      options.settings = { url: url.value }
    }
    models.value = await api.extensions.getProviderModels(selectedProviderId.value, options)
    // Auto-select first model if available
    const firstModel = models.value[0]
    if (firstModel && !selectedModelId.value) {
      selectedModelId.value = firstModel.id
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load models'
    console.error('Failed to load models:', err)
    models.value = []
  } finally {
    loadingModels.value = false
  }
}

/**
 * Save the model configuration
 */
async function save() {
  if (!canSave.value || !selectedProvider.value) return

  saving.value = true
  error.value = null
  try {
    // Build settings override if URL is configured
    const settingsOverride: Record<string, unknown> | undefined =
      needsUrlConfig.value && url.value ? { url: url.value } : undefined

    await api.modelConfigs.create({
      name: name.value.trim(),
      providerId: selectedProviderId.value,
      providerExtensionId: selectedProvider.value.extensionId,
      modelId: selectedModelId.value,
      isDefault: isDefault.value,
      settingsOverride,
    })
    emit('saved')
    resetForm()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save model'
    console.error('Failed to save model config:', err)
  } finally {
    saving.value = false
  }
}

/**
 * Reset form state
 */
function resetForm() {
  name.value = ''
  selectedProviderId.value = ''
  selectedModelId.value = ''
  isDefault.value = false
  url.value = ''
  models.value = []
  error.value = null
}

/**
 * Handle provider change
 */
function onProviderChange() {
  selectedModelId.value = ''
  // Set default URL for Ollama provider
  if (selectedProviderId.value === 'ollama') {
    url.value = DEFAULT_OLLAMA_URL
  } else {
    url.value = ''
  }
  loadModels()
}

/**
 * Auto-fill name when model is selected
 */
function onModelChange() {
  if (selectedModel.value && !name.value) {
    name.value = selectedModel.value.name
  }
}

// Load providers when modal opens
watch(open, (isOpen) => {
  if (isOpen) {
    loadProviders()
  } else {
    resetForm()
  }
})

// Load models when provider changes
watch(selectedProviderId, onProviderChange)

// Auto-fill name when model changes
watch(selectedModelId, onModelChange)
</script>

<template>
  <Modal
    v-model="open"
    :title="$t('settings.ai.add_model_title')"
    :close-label="$t('common.cancel')"
    max-width="500px"
  >
    <div class="add-model-form">
      <div v-if="error" class="error-message">
        <Icon name="alert-circle" />
        {{ error }}
      </div>

      <!-- Provider selection -->
      <div class="form-field">
        <label for="provider">{{ $t('settings.ai.provider') }}</label>
        <div v-if="loadingProviders" class="loading">
          <Icon name="loading-03" class="spin" />
        </div>
        <select
          v-else
          id="provider"
          v-model="selectedProviderId"
          :disabled="saving"
        >
          <option value="">{{ $t('settings.ai.select_provider') }}</option>
          <option v-for="provider in providers" :key="provider.id" :value="provider.id">
            {{ provider.name }}
          </option>
        </select>
        <p v-if="providers.length === 0 && !loadingProviders" class="hint">
          {{ $t('settings.ai.no_providers_hint') }}
        </p>
      </div>

      <!-- URL configuration (for Ollama and similar providers) -->
      <div v-if="needsUrlConfig" class="form-field">
        <label for="url">{{ $t('settings.ai.server_url') }}</label>
        <div class="url-input-row">
          <input
            id="url"
            v-model="url"
            type="text"
            :placeholder="DEFAULT_OLLAMA_URL"
            :disabled="saving"
          />
          <SimpleButton
            type="secondary"
            :disabled="!url || loadingModels"
            @click="loadModels"
          >
            <Icon v-if="loadingModels" name="loading-03" class="spin" />
            <template v-else>{{ $t('settings.ai.fetch_models') }}</template>
          </SimpleButton>
        </div>
        <p class="hint">{{ $t('settings.ai.server_url_hint') }}</p>
      </div>

      <!-- Model selection (combobox allows both selection and manual entry) -->
      <div class="form-field">
        <label for="model">{{ $t('settings.ai.model') }}</label>
        <div v-if="loadingModels" class="loading">
          <Icon name="loading-03" class="spin" />
        </div>
        <Combobox
          v-else
          v-model="selectedModelId"
          :options="modelOptions"
          :placeholder="$t('settings.ai.select_model')"
          :disabled="!selectedProviderId || saving"
        />
        <p class="hint">{{ $t('settings.ai.model_input_hint') }}</p>
      </div>

      <!-- Custom name -->
      <div class="form-field">
        <label for="name">{{ $t('settings.ai.model_name') }}</label>
        <input
          id="name"
          v-model="name"
          type="text"
          :placeholder="$t('settings.ai.model_name_placeholder')"
          :disabled="saving"
        />
        <p class="hint">{{ $t('settings.ai.model_name_hint') }}</p>
      </div>

      <!-- Set as default -->
      <div class="form-field checkbox-field">
        <label>
          <input
            v-model="isDefault"
            type="checkbox"
            :disabled="saving"
          />
          {{ $t('settings.ai.set_as_default') }}
        </label>
      </div>

      <!-- Actions -->
      <div class="actions">
        <SimpleButton @click="open = false">
          {{ $t('common.cancel') }}
        </SimpleButton>
        <SimpleButton
          type="primary"
          :disabled="!canSave"
          @click="save"
        >
          <Icon v-if="saving" name="loading-03" class="spin" />
          {{ $t('settings.ai.save_model') }}
        </SimpleButton>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.add-model-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--theme-general-color-danger-bg, rgba(220, 38, 38, 0.1));
  color: var(--theme-general-color-danger);
  border-radius: var(--border-radius-small, 0.375rem);
  font-size: 0.875rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  > label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-general-color);
  }

  > input,
  > select {
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--theme-general-border-color);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-components-input-background, transparent);
    color: var(--theme-general-color);
    transition: border-color 0.2s;

    &:focus {
      outline: none;
      border-color: var(--theme-general-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  > .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-general-color-muted);
  }

  > .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-general-color-muted);
    font-size: 0.875rem;
    padding: 0.5rem 0;
  }
}

.checkbox-field {
  > label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: 400;

    > input {
      cursor: pointer;
    }
  }
}

.url-input-row {
  display: flex;
  gap: 0.5rem;

  > input {
    flex: 1;
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--theme-general-border-color);
}

.spin {
  animation: spin 1s linear infinite;
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
