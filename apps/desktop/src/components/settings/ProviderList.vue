<template>
  <div class="provider-list">
    <div class="header">
      <div>
        <h1 class="title">{{ t('settings.ai.title') }}</h1>
        <p class="subtitle">{{ t('settings.ai.subtitle') }}</p>
      </div>
      <SimpleButton @click="$emit('add')" type="primary">
        {{ t('settings.ai.add_model') }}
      </SimpleButton>
    </div>

    <div v-if="providers.length === 0" class="empty">
      <p>{{ t('settings.ai.no_models') }}</p>
    </div>

    <div v-else class="list">
      <div
        v-for="provider in providers"
        :key="provider.id"
        class="provider-card"
        :class="{ active: provider.id === activeProviderId }"
      >
        <div class="provider-info">
          <div class="provider-header">
            <h4 class="provider-name">{{ provider.displayName || provider.type }}</h4>
            <span v-if="provider.id === activeProviderId" class="active-badge">
              {{ t('settings.ai.active_label') }}
            </span>
          </div>
          <p class="provider-details">
            <span class="detail-item">{{ getProviderTypeName(provider.type) }}</span>
            <span v-if="provider.model" class="detail-item">{{ provider.model }}</span>
          </p>
        </div>

        <div class="provider-actions">
          <SimpleButton
            v-if="provider.id !== activeProviderId"
            @click="$emit('set-active', provider.id)"
            type="accent"
            :title="t('settings.ai.set_active')"
          >
            {{ t('settings.ai.set_active') }}
          </SimpleButton>
          <SimpleButton @click="$emit('edit', provider.id)" :title="t('settings.ai.edit')">
            {{ t('settings.ai.edit') }}
          </SimpleButton>
          <SimpleButton
            type="danger"
            @click="handleDelete(provider.id)"
            :title="t('settings.ai.delete')"
          >
            {{ t('settings.ai.delete') }}
          </SimpleButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { ProviderName } from '@stina/settings';

  export interface ProviderListItem {
    id: string;
    type: ProviderName;
    displayName?: string;
    model?: string;
  }

  defineProps<{
    providers: ProviderListItem[];
    activeProviderId?: string;
  }>();

  const emit = defineEmits<{
    add: [];
    'set-active': [id: string];
    edit: [id: string];
    delete: [id: string];
  }>();

  /**
   * Returns a human-readable name for the provider type.
   */
  function getProviderTypeName(type: ProviderName): string {
    const names: Record<ProviderName, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Google Gemini',
      ollama: 'Ollama',
    };
    return names[type] || type;
  }

  /**
   * Confirms deletion before emitting the delete event.
   */
  function handleDelete(id: string) {
    if (confirm(t('settings.ai.confirm_delete'))) {
      emit('delete', id);
    }
  }
</script>

<style scoped>
  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .subtitle {
    margin: 1rem 0 0;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .empty {
    padding: var(--space-8);
    text-align: center;
    color: var(--muted);
    background: var(--bg-elev);
    border: 2px dashed var(--border);
    border-radius: 2em;
  }

  .list {
    display: flex;
    flex-direction: column;
  }

  .provider-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--bg-bg);
    border: 2px solid var(--border);
    transition: border-color 0.15s ease;

    &:first-of-type {
      border-radius: var(--border-radius-normal) var(--border-radius-normal) 0 0;
    }

    &:last-of-type {
      border-radius: 0 0 var(--border-radius-normal) var(--border-radius-normal);
    }
  }

  .provider-card.active {
    border-color: var(--accent);
    background: var(--empty-bg);
  }

  .provider-info {
    flex: 1;
    min-width: 0;
  }

  .provider-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1em;
  }

  .provider-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
  }

  .active-badge {
    padding: 0.25rem 0.5rem;
    background: var(--accent);
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: var(--radius-1);
  }

  .provider-details {
    margin: 0;
    font-size: 1rem;
    color: var(--muted);
    display: flex;
    gap: 0.5rem;
  }

  .detail-item::after {
    content: '·';
    margin-left: 0.5rem;
  }

  .detail-item:last-child::after {
    content: '';
  }

  .provider-actions {
    display: flex;
    gap: 0.5rem;
  }
</style>
