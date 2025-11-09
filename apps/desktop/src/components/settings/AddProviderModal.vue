<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="handleCancel">
    <div class="modal">
      <div class="modal-header">
        <h2>{{
          editMode ? t('settings.edit_provider.title') : t('settings.add_provider.title')
        }}</h2>
        <button class="close-btn" @click="handleCancel" aria-label="Close">×</button>
      </div>

      <div class="modal-body">
        <!-- Step 1: Select Service (only shown when adding, not editing) -->
        <div v-if="step === 1 && !editMode" class="step">
          <h3 class="step-title">{{ t('settings.add_provider.step_service') }}</h3>
          <p class="step-description">{{ t('settings.add_provider.choose_service') }}</p>

          <div class="service-grid">
            <button
              v-for="service in services"
              :key="service.type"
              class="service-card"
              :class="{ selected: selectedService === service.type }"
              @click="selectedService = service.type"
            >
              <h4>{{ service.name }}</h4>
              <p>{{ service.description }}</p>
            </button>
          </div>
        </div>

        <!-- Step 2: Configure -->
        <div v-if="step === 2" class="step">
          <h3 class="step-title">{{ t('settings.add_provider.step_config') }}</h3>

          <form class="config-form" @submit.prevent>
            <!-- Display Name (all providers) -->
            <label>
              {{ t('settings.add_provider.display_name') }}
              <input
                v-model="config.displayName"
                type="text"
                :placeholder="t('settings.add_provider.display_name_placeholder')"
              />
            </label>

            <!-- API Key (OpenAI, Anthropic, Gemini) -->
            <label v-if="selectedService !== 'ollama'">
              {{ t('settings.add_provider.api_key') }}
              <input
                v-model="config.apiKey"
                type="password"
                :placeholder="
                  editMode
                    ? t('settings.edit_provider.api_key_placeholder')
                    : t('settings.add_provider.api_key_placeholder')
                "
                :required="!editMode"
              />
              <span v-if="editMode" class="field-hint">{{
                t('settings.edit_provider.api_key_hint')
              }}</span>
            </label>

            <!-- Base URL (optional for API providers) -->
            <label v-if="selectedService !== 'ollama'">
              {{ t('settings.add_provider.base_url') }}
              <input v-model="config.baseUrl" type="text" :placeholder="getBaseUrlPlaceholder()" />
            </label>

            <!-- Host (Ollama) -->
            <label v-if="selectedService === 'ollama'">
              {{ t('settings.add_provider.host') }}
              <input
                v-model="config.host"
                type="text"
                :placeholder="t('settings.add_provider.host_placeholder')"
              />
            </label>

            <!-- Model (all providers) -->
            <label>
              {{ t('settings.add_provider.model') }}
              <input
                v-model="config.model"
                type="text"
                :placeholder="getModelPlaceholder()"
                required
              />
            </label>
          </form>
        </div>
      </div>

      <div class="modal-footer">
        <button v-if="step === 2 && !editMode" class="btn secondary" @click="step = 1">
          {{ t('settings.add_provider.back') }}
        </button>
        <button class="btn secondary" @click="handleCancel">
          {{ t('settings.add_provider.cancel') }}
        </button>
        <button
          v-if="step === 1 && !editMode"
          class="btn primary"
          @click="nextStep"
          :disabled="!selectedService"
        >
          {{ t('settings.add_provider.next') }}
        </button>
        <button v-if="step === 2" class="btn primary" @click="handleSave">
          {{ t('settings.add_provider.save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { ProviderName } from '@stina/settings';
  import { computed, reactive, ref, watch } from 'vue';

  export interface ProviderConfig {
    displayName?: string;
    apiKey?: string;
    baseUrl?: string;
    host?: string;
    model?: string;
  }

  export interface EditProviderData {
    type: ProviderName;
    config: ProviderConfig;
  }

  const props = defineProps<{
    isOpen: boolean;
    editData?: EditProviderData;
  }>();

  const emit = defineEmits<{
    close: [];
    save: [type: ProviderName, config: ProviderConfig];
  }>();

  const editMode = computed(() => !!props.editData);
  const step = ref(1);
  const selectedService = ref<ProviderName | null>(null);
  const config = reactive<ProviderConfig>({
    displayName: '',
    apiKey: '',
    baseUrl: '',
    host: '',
    model: '',
  });

  /**
   * Available AI services that can be configured.
   */
  const services = [
    {
      type: 'openai' as ProviderName,
      name: t('settings.add_provider.openai.name'),
      description: t('settings.add_provider.openai.description'),
    },
    {
      type: 'anthropic' as ProviderName,
      name: t('settings.add_provider.anthropic.name'),
      description: t('settings.add_provider.anthropic.description'),
    },
    {
      type: 'gemini' as ProviderName,
      name: t('settings.add_provider.gemini.name'),
      description: t('settings.add_provider.gemini.description'),
    },
    {
      type: 'ollama' as ProviderName,
      name: t('settings.add_provider.ollama.name'),
      description: t('settings.add_provider.ollama.description'),
    },
  ];

  /**
   * Resets or populates the modal state when opened/closed or edit data changes.
   */
  watch(
    () => [props.isOpen, props.editData] as const,
    ([isOpen, editData]) => {
      if (!isOpen) {
        // Reset on close
        step.value = 1;
        selectedService.value = null;
        config.displayName = '';
        config.apiKey = '';
        config.baseUrl = '';
        config.host = '';
        config.model = '';
      } else if (editData) {
        // Populate with edit data
        step.value = 2; // Skip service selection
        selectedService.value = editData.type;
        config.displayName = editData.config.displayName || '';
        config.apiKey = ''; // Don't pre-fill sensitive data
        config.baseUrl = editData.config.baseUrl || '';
        config.host = editData.config.host || '';
        config.model = editData.config.model || '';
      } else {
        // Reset for new provider
        step.value = 1;
        selectedService.value = null;
        config.displayName = '';
        config.apiKey = '';
        config.baseUrl = '';
        config.host = '';
        config.model = '';
      }
    },
  );

  /**
   * Returns placeholder text for base URL based on selected service.
   */
  function getBaseUrlPlaceholder(): string {
    switch (selectedService.value) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'anthropic':
        return 'https://api.anthropic.com';
      case 'gemini':
        return 'https://generativelanguage.googleapis.com';
      default:
        return t('settings.add_provider.base_url_placeholder');
    }
  }

  /**
   * Returns placeholder text for model based on selected service.
   */
  function getModelPlaceholder(): string {
    switch (selectedService.value) {
      case 'openai':
        return 'gpt-4o';
      case 'anthropic':
        return 'claude-3-5-sonnet-20241022';
      case 'gemini':
        return 'gemini-1.5-pro';
      case 'ollama':
        return 'llama3.1:8b';
      default:
        return t('settings.add_provider.model_placeholder');
    }
  }

  /**
   * Advances to the configuration step.
   */
  function nextStep() {
    if (selectedService.value) {
      step.value = 2;
    }
  }

  /**
   * Cancels the modal and resets state.
   */
  function handleCancel() {
    emit('close');
  }

  /**
   * Saves the configuration and emits to parent.
   */
  function handleSave() {
    if (!selectedService.value) return;

    // Build config object based on provider type
    const providerConfig: ProviderConfig = {
      displayName: config.displayName || undefined,
      model: config.model || undefined,
    };

    if (selectedService.value === 'ollama') {
      providerConfig.host = config.host || undefined;
    } else {
      // Only include API key if it's provided (important for edit mode)
      if (config.apiKey) {
        providerConfig.apiKey = config.apiKey;
      }
      providerConfig.baseUrl = config.baseUrl || undefined;
    }

    emit('save', selectedService.value, providerConfig);
    emit('close');
  }
</script>

<style scoped>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--panel);
    border-radius: var(--radius-3);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--text-lg);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
    color: var(--muted);
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    color: var(--text);
  }

  .modal-body {
    padding: var(--space-4);
    overflow-y: auto;
    flex: 1;
  }

  .step-title {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .step-description {
    margin: 0 0 var(--space-4) 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }

  .service-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3);
  }

  .service-card {
    padding: var(--space-4);
    background: var(--bg-elev);
    border: 2px solid var(--border);
    border-radius: var(--radius-2);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .service-card:hover {
    border-color: var(--accent);
    background: var(--bg);
  }

  .service-card.selected {
    border-color: var(--accent);
    background: var(--bg);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .service-card h4 {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--text-base);
  }

  .service-card p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .config-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .config-form label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .config-form input {
    padding: var(--space-2);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-2);
    font-size: var(--text-base);
  }

  .config-form input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--muted);
    font-weight: 400;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-4);
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-2);
    cursor: pointer;
    font-size: var(--text-sm);
    font-weight: 500;
    transition: opacity 0.15s ease;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent);
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn.secondary {
    background: var(--bg-elev);
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn.secondary:hover {
    background: var(--bg);
  }
</style>
