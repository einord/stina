<script setup lang="ts">
/**
 * Modal for editing an existing AI model configuration.
 * Allows updating name and deleting the model.
 */
import { ref, watch, computed } from 'vue'
import type { ModelConfigDTO } from '@stina/shared'
import { useApi } from '../../../composables/useApi.js'
import Modal from '../../common/Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'

const props = defineProps<{
  model?: ModelConfigDTO
}>()

const open = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  saved: []
  deleted: []
}>()

const api = useApi()

// Form state
const name = ref('')
const isDefault = ref(false)
const url = ref('')

// Default URL for Ollama provider
const DEFAULT_OLLAMA_URL = 'http://localhost:11434'

// State
const saving = ref(false)
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const error = ref<string | null>(null)

const canSave = computed(() => name.value.trim() && !saving.value && !deleting.value)

// Check if the provider needs URL configuration (e.g., Ollama)
const needsUrlConfig = computed(() => {
  return props.model?.providerId === 'ollama'
})

/**
 * Initialize form with model data
 */
function initForm() {
  if (props.model) {
    name.value = props.model.name
    isDefault.value = props.model.isDefault
    // Read URL from settingsOverride if available
    url.value = (props.model.settingsOverride?.['url'] as string) || DEFAULT_OLLAMA_URL
  }
  error.value = null
  showDeleteConfirm.value = false
}

/**
 * Save changes
 */
async function save() {
  if (!canSave.value || !props.model) return

  saving.value = true
  error.value = null
  try {
    // Build settingsOverride if URL is configured
    const settingsOverride: Record<string, unknown> | undefined =
      needsUrlConfig.value && url.value ? { url: url.value } : undefined

    await api.modelConfigs.update(props.model.id, {
      name: name.value.trim(),
      isDefault: isDefault.value,
      settingsOverride,
    })
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to save changes'
    console.error('Failed to update model config:', err)
  } finally {
    saving.value = false
  }
}

/**
 * Delete the model
 */
async function deleteModel() {
  if (!props.model) return

  deleting.value = true
  error.value = null
  try {
    await api.modelConfigs.delete(props.model.id)
    emit('deleted')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete model'
    console.error('Failed to delete model config:', err)
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
  }
}

// Initialize form when model changes or modal opens
watch([() => props.model, open], ([, isOpen]) => {
  if (isOpen) {
    initForm()
  }
})
</script>

<template>
  <Modal
    v-model="open"
    :title="$t('settings.ai.edit_model_title')"
    :close-label="$t('common.close')"
    max-width="500px"
  >
    <div v-if="model" class="edit-model-form">
      <div v-if="error" class="error-message">
        <Icon name="alert-circle" />
        {{ error }}
      </div>

      <!-- Model info (read-only) -->
      <div class="model-info">
        <div class="info-row">
          <span class="label">{{ $t('settings.ai.provider') }}</span>
          <span class="value">{{ model.providerId }}</span>
        </div>
        <div class="info-row">
          <span class="label">{{ $t('settings.ai.model') }}</span>
          <span class="value">{{ model.modelId }}</span>
        </div>
      </div>

      <!-- URL configuration (for Ollama and similar providers) -->
      <div v-if="needsUrlConfig" class="form-field">
        <label for="edit-url">{{ $t('settings.ai.server_url') }}</label>
        <input
          id="edit-url"
          v-model="url"
          type="text"
          :placeholder="DEFAULT_OLLAMA_URL"
          :disabled="saving || deleting"
        />
        <p class="hint">{{ $t('settings.ai.server_url_hint') }}</p>
      </div>

      <!-- Custom name -->
      <div class="form-field">
        <label for="edit-name">{{ $t('settings.ai.model_name') }}</label>
        <input
          id="edit-name"
          v-model="name"
          type="text"
          :placeholder="$t('settings.ai.model_name_placeholder')"
          :disabled="saving || deleting"
        />
      </div>

      <!-- Set as default -->
      <div class="form-field checkbox-field">
        <label>
          <input v-model="isDefault" type="checkbox" :disabled="saving || deleting" />
          {{ $t('settings.ai.set_as_default') }}
        </label>
      </div>

      <!-- Delete section -->
      <div class="danger-zone">
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
        {{ $t('common.save') }}
      </SimpleButton>
    </template>
  </Modal>
</template>

<style scoped>
.edit-model-form {
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

.model-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem;
  background: var(--theme-general-background-hover);
  border-radius: var(--border-radius-small, 0.375rem);

  > .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;

    > .label {
      color: var(--theme-general-color-muted);
    }

    > .value {
      color: var(--theme-general-color);
      font-weight: 500;
    }
  }
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

  > input {
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

.danger-zone {
  padding: 1rem;
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
