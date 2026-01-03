<script setup lang="ts">
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import type { ProviderName } from '@stina/settings';

  import SettingsPanel from '../common/SettingsPanel.vue';

  import EntityList from './EntityList.vue';

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
  const EditBtn = EditIcon;
  const DeleteBtn = DeleteIcon;
</script>

<template>
  <SettingsPanel>
    <EntityList
      :title="t('settings.ai.title')"
      :description="t('settings.ai.subtitle')"
      :empty-text="t('settings.ai.no_models')"
    >
      <template #actions>
        <SimpleButton @click="$emit('add')" type="primary">
          {{ t('settings.ai.add_model') }}
        </SimpleButton>
      </template>

      <li
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
          <SimpleButton
            @click="$emit('edit', provider.id)"
            :title="t('settings.ai.edit')"
            aria-label="edit"
          >
            <EditBtn />
          </SimpleButton>
          <SimpleButton
            type="danger"
            @click="handleDelete(provider.id)"
            :title="t('settings.ai.delete')"
            aria-label="delete"
          >
            <DeleteBtn />
          </SimpleButton>
        </div>
      </li>
    </EntityList>
  </SettingsPanel>
</template>

<style scoped>
  .provider-card {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;

    &.active {
      border-color: var(--accent);
      z-index: 1;
    }

    > .provider-info {
      flex: 1;
      min-width: 0;

      > .provider-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1em;

        > .provider-name {
          margin: 0;
          font-size: 1rem;
          font-weight: 500;
        }
        > .active-badge {
          padding: 0.25rem 0.5rem;
          background: var(--accent);
          color: var(--accent-fg);
          font-size: 0.75rem;
          font-weight: var(--font-weight-light);
          border-radius: var(--radius-1);
          border-radius: var(--border-radius-normal);
        }
      }
      > .provider-details {
        margin: 0;
        font-size: 1rem;
        color: var(--muted);
        display: flex;
        gap: 0.5rem;

        > .detail-item {
          &:not(:last-child) {
            &::after {
              content: '·';
              margin-left: 0.5rem;
            }
          }
        }
      }
    }

    > .provider-actions {
      display: flex;
      gap: 0.5rem;
    }
  }
</style>
