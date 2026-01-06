<script setup lang="ts">
/**
 * Modal for selecting an AI provider when adding a new model configuration.
 * Shows available providers as large buttons for easy selection.
 */
import { ref, watch } from 'vue'
import { useApi, type ProviderInfo } from '../../../composables/useApi.js'
import Modal from '../../common/Modal.vue'
import LargeButton from '../../buttons/LargeButton.vue'
import Icon from '../../common/Icon.vue'

const open = defineModel<boolean>({ default: false })

const emit = defineEmits<{
  /** Emitted when a provider is selected */
  'select-provider': [provider: ProviderInfo]
}>()

const api = useApi()

// Data state
const providers = ref<ProviderInfo[]>([])
const loadingProviders = ref(false)
const error = ref<string | null>(null)

/**
 * Provider descriptions (can be extended or fetched from API)
 */
const providerDescriptions: Record<string, string> = {
  ollama: 'Run AI models locally on your machine',
  openai: 'Access GPT-4, GPT-3.5 and other OpenAI models',
  anthropic: 'Access Claude models from Anthropic',
  echo: 'Test provider that echoes back your messages',
}

/**
 * Get description for a provider
 */
function getProviderDescription(providerId: string): string | undefined {
  return providerDescriptions[providerId]
}

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
 * Handle provider selection
 */
function selectProvider(provider: ProviderInfo) {
  emit('select-provider', provider)
  open.value = false
}

// Load providers when modal opens
watch(open, (isOpen) => {
  if (isOpen) {
    loadProviders()
  }
})
</script>

<template>
  <Modal
    v-model="open"
    :title="$t('settings.ai.select_provider_title')"
    :close-label="$t('common.close')"
    max-width="480px"
  >
    <div class="provider-selection">
      <p class="description">{{ $t('settings.ai.select_provider_description') }}</p>

      <div v-if="error" class="error-message">
        <Icon name="alert-circle" />
        {{ error }}
      </div>

      <div v-if="loadingProviders" class="loading">
        <Icon name="loading-03" class="spin" />
        <span>{{ $t('common.loading') }}</span>
      </div>

      <div v-else-if="providers.length === 0" class="empty-state">
        <Icon name="alert-circle" />
        <p>{{ $t('settings.ai.no_providers_hint') }}</p>
      </div>

      <div v-else class="provider-list">
        <LargeButton
          v-for="provider in providers"
          :key="provider.id"
          :title="provider.name"
          :description="getProviderDescription(provider.id)"
          @click="selectProvider(provider)"
        />
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.provider-selection {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  > .description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-general-color-muted);
  }

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

  > .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-general-color-muted);
    font-size: 0.875rem;
  }

  > .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem;
    color: var(--theme-general-color-muted);
    text-align: center;

    > p {
      margin: 0;
      font-size: 0.875rem;
    }
  }

  > .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
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
