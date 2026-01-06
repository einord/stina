<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ModelConfigDTO } from '@stina/shared'
import { useApi, type ProviderInfo } from '../../../composables/useApi.js'
import EntityList from '../../common/EntityList.vue'
import IconToggleButton from '../../buttons/IconToggleButton.vue'
import AiEditModelModal from './Ai.Models.EditModal.vue'
import AiSelectProviderModal from './Ai.Models.Modal.vue'
import SimpleButton from '../../buttons/SimpleButton.vue'
import Icon from '../../common/Icon.vue'

const api = useApi()

// Models state
const models = ref<ModelConfigDTO[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// Edit modal state
const currentEditModel = ref<ModelConfigDTO>()
const showEditModelModal = ref(false)

// Add model flow state (two-step: select provider -> configure model)
const showSelectProviderModal = ref(false)
const selectedProvider = ref<ProviderInfo>()
const showConfigureModelModal = ref(false)

const defaultModelId = computed(() => {
  const defaultModel = models.value.find((m) => m.isDefault)
  return defaultModel?.id ?? null
})

/**
 * Load model configurations from API
 */
async function loadModels() {
  loading.value = true
  error.value = null
  try {
    models.value = await api.modelConfigs.list()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load models'
    console.error('Failed to load model configs:', err)
  } finally {
    loading.value = false
  }
}

/**
 * Set a model as the default
 */
async function setAsDefault(id: string) {
  try {
    await api.modelConfigs.setDefault(id)
    await loadModels()
  } catch (err) {
    console.error('Failed to set default model:', err)
  }
}

/**
 * Open edit modal for an existing model
 */
function editModel(model: ModelConfigDTO) {
  currentEditModel.value = model
  selectedProvider.value = undefined
  showEditModelModal.value = true
}

/**
 * Start the add model flow (opens provider selection)
 */
function startAddModel() {
  showSelectProviderModal.value = true
}

/**
 * Handle provider selection - opens configure modal
 */
function handleProviderSelected(provider: ProviderInfo) {
  selectedProvider.value = provider
  currentEditModel.value = undefined
  showConfigureModelModal.value = true
}

/**
 * Handle model saved from any modal
 */
async function handleModelSaved() {
  showEditModelModal.value = false
  showConfigureModelModal.value = false
  await loadModels()
}

/**
 * Handle model deleted from edit modal
 */
async function handleModelDeleted() {
  showEditModelModal.value = false
  await loadModels()
}

onMounted(() => {
  loadModels()
})
</script>

<template>
  <div class="ai-models-settings">
    <EntityList
      :title="$t('settings.ai.models_title')"
      :description="$t('settings.ai.models_description')"
      :empty-text="$t('settings.ai.no_models')"
      :child-items="models"
      :loading="loading"
      :error="error ?? undefined"
    >
      <template #actions>
        <SimpleButton :title="$t('settings.ai.add_model')" @click="startAddModel">
          <Icon name="add-01" />
          {{ $t('settings.ai.add_model') }}
        </SimpleButton>
      </template>
      <template #default="{ item }">
        <div
          class="ai-model-item"
          :class="{ active: defaultModelId === item.id }"
          @click="setAsDefault(item.id)"
        >
          <div class="model-header">
            <h3 class="model-name">{{ item.name }}</h3>
          </div>
          <p class="model-details">{{ item.providerId }} · {{ item.modelId }}</p>
          <div class="actions">
            <IconToggleButton
              icon="edit-01"
              :tooltip="$t('settings.ai.edit_model')"
              @click.stop="editModel(item)"
            />
          </div>
        </div>
      </template>
    </EntityList>

    <!-- Provider selection modal (step 1 of add flow) -->
    <AiSelectProviderModal
      v-model="showSelectProviderModal"
      @select-provider="handleProviderSelected"
    />

    <!-- Configure model modal (step 2 of add flow, with provider) -->
    <AiEditModelModal
      v-model="showConfigureModelModal"
      :provider="selectedProvider"
      @saved="handleModelSaved"
    />

    <!-- Edit existing model modal -->
    <AiEditModelModal
      v-model="showEditModelModal"
      :model="currentEditModel"
      @saved="handleModelSaved"
      @deleted="handleModelDeleted"
    />
  </div>
</template>

<style scoped>
.ai-models-settings {
  :deep(.item) {
    cursor: pointer;

    &:has(> .active) {
      border-color: var(--theme-general-border-color-active);
      z-index: 1;
    }

    .ai-model-item {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'header actions'
        'details details';

      > .model-header {
        grid-area: header;
        display: flex;
        align-items: center;
        gap: 0.5rem;

        > .model-name {
          margin: 0;
          font-size: 1rem;
          font-weight: 500;
          color: var(--theme-general-color);
        }

        > .default-badge {
          padding: 0.125rem 0.5rem;
          background: var(--theme-general-color-primary);
          color: white;
          border-radius: 999px;
          font-size: 0.625rem;
          font-weight: 500;
          text-transform: uppercase;
        }
      }

      > .model-details {
        grid-area: details;
        margin: 0.25rem 0 0;
        font-size: 0.875rem;
        color: var(--theme-general-color-muted);
      }

      > .actions {
        grid-area: actions;
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
    }
  }
}
</style>
