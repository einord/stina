<template>
  <div class="ai-settings">
    <ProviderList
      :providers="providerList"
      :active-provider-id="activeProviderId"
      @add="handleAdd"
      @edit="handleEdit"
      @set-active="setActiveProvider"
      @delete="deleteProvider"
    />

    <AddProviderModal
      :is-open="showModal"
      :edit-data="editData"
      @close="closeModal"
      @save="handleSaveProvider"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ProviderConfigs, ProviderName } from '@stina/settings';
  import { computed, onMounted, ref } from 'vue';

  import AddProviderModal, { type EditProviderData } from './AddProviderModal.vue';
  import ProviderList, { type ProviderListItem } from './ProviderList.vue';

  const settings = ref<{
    providers: ProviderConfigs;
    active?: ProviderName;
  }>({ providers: {} });

  const showModal = ref(false);
  const editData = ref<EditProviderData | undefined>(undefined);

  /**
   * Converts the settings object to a flat list of providers for display.
   * Each configured provider gets a unique ID based on its type.
   * Future: support multiple configs per type with proper IDs.
   */
  const providerList = computed<ProviderListItem[]>(() => {
    const list: ProviderListItem[] = [];
    const providers = settings.value.providers;

    // Check if provider has any configuration (not just apiKey)
    if (providers.openai && Object.keys(providers.openai).length > 0) {
      list.push({
        id: 'openai',
        type: 'openai',
        model: providers.openai.model || undefined,
      });
    }
    if (providers.anthropic && Object.keys(providers.anthropic).length > 0) {
      list.push({
        id: 'anthropic',
        type: 'anthropic',
        model: providers.anthropic.model || undefined,
      });
    }
    if (providers.gemini && Object.keys(providers.gemini).length > 0) {
      list.push({
        id: 'gemini',
        type: 'gemini',
        model: providers.gemini.model || undefined,
      });
    }
    if (providers.ollama && Object.keys(providers.ollama).length > 0) {
      list.push({
        id: 'ollama',
        type: 'ollama',
        model: providers.ollama.model || undefined,
      });
    }

    return list;
  });

  /**
   * Returns the ID of the currently active provider.
   */
  const activeProviderId = computed(() => settings.value.active);

  /**
   * Loads current settings from the backend.
   */
  async function loadSettings() {
    const previousActive = settings.value.active;
    const nextSettings = await window.stina.settings.get();
    settings.value = nextSettings;
    // If we just activated a provider and there are no messages yet, start a new chat session.
    if (!previousActive && nextSettings.active) {
      const messageCount = await window.stina.chat.getCount();
      if (messageCount === 0) {
        await window.stina.chat.newSession();
      }
    }
    lastActive.value = nextSettings.active;
  }

  /**
   * Opens the modal in add mode.
   */
  function handleAdd() {
    editData.value = undefined;
    showModal.value = true;
  }

  /**
   * Opens the modal in edit mode with the selected provider's data.
   */
  function handleEdit(id: string) {
    const type = id as ProviderName;
    const providerConfig = settings.value.providers[type];

    if (providerConfig) {
      editData.value = {
        type,
        config: {
          displayName: undefined, // We don't store display names yet
          baseUrl:
            type !== 'ollama' && 'baseUrl' in providerConfig
              ? providerConfig.baseUrl || undefined
              : undefined,
          host:
            type === 'ollama' && 'host' in providerConfig
              ? providerConfig.host || undefined
              : undefined,
          model: providerConfig.model || undefined,
        },
      };
      showModal.value = true;
    }
  }

  /**
   * Closes the modal and clears edit data.
   */
  function closeModal() {
    showModal.value = false;
    editData.value = undefined;
  }

  /**
   * Saves a provider configuration (add or edit) with auto-save.
   */
  async function handleSaveProvider(
    type: ProviderName,
    config: {
      displayName?: string;
      apiKey?: string;
      baseUrl?: string;
      host?: string;
      model?: string;
    },
  ) {
    await window.stina.settings.updateProvider(type, config);
    await loadSettings();
  }

  /**
   * Sets a provider as the active one with auto-save.
   */
  async function setActiveProvider(id: string) {
    const type = id as ProviderName;
    await window.stina.settings.setActive(type);
    await loadSettings();
  }

  /**
   * Deletes a provider configuration with auto-save.
   */
  async function deleteProvider(id: string) {
    const type = id as ProviderName;
    // Clear all fields for this provider
    if (type === 'ollama') {
      await window.stina.settings.updateProvider(type, { host: '', model: '' });
    } else {
      await window.stina.settings.updateProvider(type, { apiKey: '', baseUrl: '', model: '' });
    }
    // If this was the active provider, clear the active selection
    if (settings.value.active === type) {
      await window.stina.settings.setActive(undefined);
    }
    await loadSettings();
  }

  onMounted(loadSettings);
</script>
