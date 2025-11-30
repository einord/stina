<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { ProviderName } from '@stina/settings';
  import { computed, reactive, ref, watch } from 'vue';

  import BaseModal from '../common/BaseModal.vue';
  import FormHeader from '../common/FormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormSelect from '../form/FormSelect.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';

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

    // Build config object - only include fields that have actual values
    const providerConfig: ProviderConfig = {};

    if (config.displayName) {
      providerConfig.displayName = config.displayName;
    }

    if (config.model) {
      providerConfig.model = config.model;
    }

    if (selectedService.value === 'ollama') {
      if (config.host) {
        providerConfig.host = config.host;
      }
    } else {
      // Only include API key if it's provided (important for edit mode)
      if (config.apiKey) {
        providerConfig.apiKey = config.apiKey;
      }
      if (config.baseUrl) {
        providerConfig.baseUrl = config.baseUrl;
      }
    }

    emit('save', selectedService.value, providerConfig);
    emit('close');
  }
</script>

<template>
  <BaseModal
    :open="isOpen"
    :title="editMode ? t('settings.edit_provider.title') : t('settings.add_provider.title')"
    :close-label="t('settings.add_provider.cancel')"
    @close="handleCancel"
  >
    <!-- Step 1: Select Service (only shown when adding, not editing) -->
    <div v-if="step === 1 && !editMode" class="step">
      <FormHeader
        :title="t('settings.add_provider.step_service')"
        :description="t('settings.add_provider.choose_service')"
      />

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
        <FormInputText
          v-model="config.displayName"
          :label="t('settings.add_provider.display_name')"
          :placeholder="t('settings.add_provider.display_name_placeholder')"
        />

        <FormInputText
          v-if="selectedService !== 'ollama'"
          v-model="config.apiKey"
          type="password"
          :label="t('settings.add_provider.api_key')"
          :placeholder="
            editMode
              ? t('settings.edit_provider.api_key_placeholder')
              : t('settings.add_provider.api_key_placeholder')
          "
          :required="!editMode"
          :hint="editMode ? t('settings.edit_provider.api_key_hint') : undefined"
        />

        <FormInputText
          v-if="selectedService !== 'ollama'"
          v-model="config.baseUrl"
          :label="t('settings.add_provider.base_url')"
          :placeholder="getBaseUrlPlaceholder()"
        />

        <FormInputText
          v-if="selectedService === 'ollama'"
          v-model="config.host"
          :label="t('settings.add_provider.host')"
          :placeholder="t('settings.add_provider.host_placeholder')"
        />

        <FormInputText
          v-model="config.model"
          :label="t('settings.add_provider.model')"
          :placeholder="getModelPlaceholder()"
          required
        />
      </form>
    </div>

    <template #footer>
      <SimpleButton v-if="step === 2 && !editMode" @click="step = 1">
        {{ t('settings.add_provider.back') }}
      </SimpleButton>
      <SimpleButton @click="handleCancel">
        {{ t('settings.add_provider.cancel') }}
      </SimpleButton>
      <SimpleButton
        v-if="step === 1 && !editMode"
        type="primary"
        @click="nextStep"
        :disabled="!selectedService"
      >
        {{ t('settings.add_provider.next') }}
      </SimpleButton>
      <SimpleButton v-if="step === 2" type="primary" @click="handleSave">
        {{ t('settings.add_provider.save') }}
      </SimpleButton>
    </template>
  </BaseModal>
</template>

<style scoped>
  .step-title {
    margin: 0 0 2em 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .step-description {
    margin: 0 0 4em 0;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .service-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 3em;

    > .service-card {
      padding: 1rem;
      background: var(--bg-elev);
      border: 2px solid var(--border);
      border-radius: 1rem;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;

      &:hover {
        border-color: var(--accent);
        background: var(--empty-bg);
      }

      &.selected {
        border-color: var(--accent);
        background: var(--empty-bg);
        box-shadow: 0 0 0 1px var(--accent);
      }

      > h4 {
        margin: 0 0 1rem 0;
        font-size: var(--text-base);
      }

      > p {
        margin: 0;
        font-size: 0.75rem;
        color: var(--muted);
      }
    }
  }

  .config-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
