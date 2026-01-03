<script setup lang="ts">
/**
 * Modal for configuring an AI model.
 * Used both for creating new models (when provider is passed) and editing existing models.
 * Uses standard form components for consistent UI.
 */
import { ref, watch, computed } from 'vue'
import type { ModelConfigDTO } from '@stina/shared'
import type { ModelInfo } from '@stina/extension-api'
import { useApi, type ProviderInfo } from '../../../composables/useApi.js'
import Modal from '../../common/Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'
import TextInput from '../../inputs/TextInput.vue'
import Toggle from '../../inputs/Toggle.vue'
import Combobox from '../../common/Combobox.vue'

const props = defineProps<{
  /** Existing model to edit (edit mode) */
  model?: ModelConfigDTO
  /** Provider for new model (create mode) */
  provider?: ProviderInfo
}>()

const open = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const api = useApi()

// Form state
const name = ref('')
const modelId = ref('')
const isDefault = ref(false)
const url = ref('')

// Default URL for Ollama provider
const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

// Data state
const models = ref<ModelInfo[]>([])
const loadingModels = ref(false)
const saving = ref(false)
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const error = ref<string | null>(null)

// Computed properties
const isEditMode = computed(() => !!props.model)
const providerId = computed(() => props.model?.providerId ?? props.provider?.id ?? '')
const providerName = computed(() => props.model?.providerId ?? props.provider?.name ?? '')

const canSave = computed(() => {
  const hasName = name.value.trim().length > 0
  const hasModel = modelId.value.trim().length > 0
  const notBusy = !saving.value && !deleting.value
  return hasName && hasModel && notBusy
})

// Check if the provider needs URL configuration (e.g., Ollama)
const needsUrlConfig = computed(() => providerId.value === 'ollama')

// Convert models to combobox options
const modelOptions = computed(() =>
  models.value.map((m) => ({
    value: m.id,
    label: m.name,
    description: m.description,
  }))
)

/**
 * Initialize form state
 */
function initForm() {
  if (props.model) {
    // Edit mode - populate from existing model
    name.value = props.model.name
    modelId.value = props.model.modelId
    isDefault.value = props.model.isDefault
    url.value = (props.model.settingsOverride?.['url'] as string) || DEFAULT_OLLAMA_URL
  } else {
    // Create mode - reset to defaults
    name.value = ''
    modelId.value = ''
    isDefault.value = false
    url.value = needsUrlConfig.value ? DEFAULT_OLLAMA_URL : ''
  }
  error.value = null
  showDeleteConfirm.value = false
  models.value = []
}

/**
 * Load available models from the provider
 */
async function loadModels() {
  if (!providerId.value) return

  loadingModels.value = true
  error.value = null
  try {
    const options: { settings?: { url?: string } } = {}
    if (needsUrlConfig.value && url.value) {
      options.settings = { url: url.value }
    }
    models.value = await api.extensions.getProviderModels(providerId.value, options)

    // Auto-select first model if none selected and in create mode
    const firstModel = models.value[0]
    if (firstModel && !modelId.value && !isEditMode.value) {
      modelId.value = firstModel.id
      if (!name.value) {
        name.value = firstModel.name
      }
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
 * Handle model selection change
 */
function onModelChange(newModelId: string) {
  modelId.value = newModelId
  // Auto-fill name if empty
  const selectedModel = models.value.find((m) => m.id === newModelId)
  if (selectedModel && !name.value) {
    name.value = selectedModel.name
  }
}

/**
 * Save the model configuration
 */
async function save() {
  if (!canSave.value) return

  saving.value = true
  error.value = null
  try {
    const settingsOverride: Record<string, unknown> | undefined =
      needsUrlConfig.value && url.value ? { url: url.value } : undefined

    if (isEditMode.value && props.model) {
      // Update existing model
      await api.modelConfigs.update(props.model.id, {
        name: name.value.trim(),
        modelId: modelId.value,
        isDefault: isDefault.value,
        settingsOverride,
      })
    } else if (props.provider) {
      // Create new model
      await api.modelConfigs.create({
        name: name.value.trim(),
        providerId: props.provider.id,
        providerExtensionId: props.provider.extensionId,
        modelId: modelId.value,
        isDefault: isDefault.value,
        settingsOverride,
      })
    }
    emit('saved')
    open.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save model'
    console.error('Failed to save model config:', err)
  } finally {
    saving.value = false
  }
}

/**
 * Delete the model (edit mode only)
 */
async function deleteModel() {
  if (!props.model) return

  deleting.value = true
  error.value = null
  try {
    await api.modelConfigs.delete(props.model.id)
    emit('deleted')
    open.value = false
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete model'
    console.error('Failed to delete model config:', err)
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

// Initialize form when modal opens or props change
watch([() => props.model, () => props.provider, open], ([, , isOpen]) => {
  if (isOpen) {
    initForm()
    // Load models when opening (for both modes)
    if (providerId.value) {
      loadModels()
    }
  }
})
</script>

<template>
  <Modal
    v-model="open"
    :title="
      isEditMode ? $t('settings.ai.edit_model_title') : $t('settings.ai.configure_model_title')
    "
    :close-label="$t('common.close')"
    max-width="500px"
  >
    <div class="model-config-form">
      <!-- Error display -->
      <div v-if="error" class="error-message">
        <Icon name="alert-circle" />
        {{ error }}
      </div>

      <!-- Provider info -->
      <div class="provider-badge">
        <span class="label">{{ $t('settings.ai.provider') }}</span>
        <span class="value">{{ providerName }}</span>
      </div>

      <!-- URL configuration (for Ollama and similar providers) -->
      <div v-if="needsUrlConfig" class="url-section">
        <TextInput
          v-model="url"
          :label="$t('settings.ai.server_url')"
          :placeholder="DEFAULT_OLLAMA_URL"
          :hint="$t('settings.ai.server_url_hint')"
          :disabled="saving || deleting"
          type="url"
        />
      </div>

      <!-- Model selection -->
      <div class="form-section">
        <label class="section-label">{{ $t('settings.ai.model') }}</label>
        <div v-if="loadingModels" class="loading">
          <Icon name="loading-03" class="spin" />
          <span>{{ $t('common.loading') }}</span>
        </div>
        <div v-else class="model-row">
          <SimpleButton
            class="refresh-button"
            :title="$t('settings.ai.fetch_models')"
            :disabled="(needsUrlConfig && !url) || loadingModels"
            @click="loadModels"
          >
            <Icon name="refresh-01" />
          </SimpleButton>
          <Combobox
            :model-value="modelId"
            :options="modelOptions"
            :placeholder="$t('settings.ai.select_model')"
            :disabled="saving || deleting"
            @update:model-value="onModelChange"
          />
        </div>
        <span class="hint">{{ $t('settings.ai.model_input_hint') }}</span>
      </div>

      <!-- Display name -->
      <TextInput
        v-model="name"
        :label="$t('settings.ai.model_name')"
        :placeholder="$t('settings.ai.model_name_placeholder')"
        :hint="$t('settings.ai.model_name_hint')"
        :disabled="saving || deleting"
      />

      <!-- Set as default toggle -->
      <Toggle
        v-model="isDefault"
        :label="$t('settings.ai.set_as_default')"
        :disabled="saving || deleting"
      />

      <!-- Delete section (edit mode only) -->
      <div v-if="isEditMode" class="danger-zone">
        <h4>{{ $t('settings.ai.danger_zone') }}</h4>
        <div v-if="!showDeleteConfirm" class="delete-action">
          <p>{{ $t('settings.ai.delete_model_description') }}</p>
          <SimpleButton type="danger" @click="showDeleteConfirm = true">
            <Icon name="delete-02" />
            {{ $t('settings.ai.delete_model') }}
          </SimpleButton>
        </div>
        <div v-else class="delete-confirm">
          <p class="confirm-text">{{ $t('settings.ai.delete_confirm') }}</p>
          <div class="confirm-actions">
            <SimpleButton @click="showDeleteConfirm = false">
              {{ $t('common.cancel') }}
            </SimpleButton>
            <SimpleButton type="danger" :disabled="deleting" @click="deleteModel">
              <Icon v-if="deleting" name="loading-03" class="spin" />
              {{ $t('settings.ai.confirm_delete') }}
            </SimpleButton>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <SimpleButton @click="open = false">
        {{ $t('common.cancel') }}
      </SimpleButton>
      <SimpleButton type="primary" :disabled="!canSave" @click="save">
        <Icon v-if="saving" name="loading-03" class="spin" />
        {{ isEditMode ? $t('common.save') : $t('settings.ai.save_model') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.model-config-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  > .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-general-color-danger-bg, rgba(220, 38, 38, 0.1));
    color: var(--theme-general-color-danger);
    border-radius: var(--border-radius-small, 0.375rem);
    font-size: 0.875rem;
  }

  > .provider-badge {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--theme-general-background-hover);
    border-radius: var(--border-radius-small, 0.375rem);
    font-size: 0.875rem;

    > .label {
      color: var(--theme-general-color-muted);
    }

    > .value {
      font-weight: 500;
      color: var(--theme-general-color);
    }
  }

  > .form-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;

    > .section-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--theme-general-color);
    }

    > .loading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      color: var(--theme-general-color-muted);
      font-size: 0.875rem;
    }

    > .model-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      > .refresh-button {
        flex-shrink: 0;
        padding: 0.5rem;
      }
    }

    > .hint {
      font-size: 0.75rem;
      color: var(--theme-general-color-muted);
    }
  }

  > .danger-zone {
    padding: 1rem;
    margin-top: 0.5rem;
    border: 1px solid var(--theme-general-color-danger);
    border-radius: var(--border-radius-small, 0.375rem);
    background: var(--theme-general-color-danger-bg, rgba(220, 38, 38, 0.05));

    > h4 {
      margin: 0 0 0.75rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-general-color-danger);
    }

    > .delete-action {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      > p {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--theme-general-color-muted);
      }
    }

    > .delete-confirm {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      > .confirm-text {
        margin: 0;
        font-size: 0.875rem;
        color: var(--theme-general-color-danger);
        font-weight: 500;
      }

      > .confirm-actions {
        display: flex;
        gap: 0.5rem;
      }
    }
  }
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
