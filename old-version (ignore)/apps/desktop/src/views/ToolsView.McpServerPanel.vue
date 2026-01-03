<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';
  import { computed } from 'vue';

  import ToolItem from '../components/tools/ToolItem.vue';
  import ToolModulePanel from '../components/tools/ToolModulePanel.vue';

  const props = defineProps<{
    server: MCPServer;
    tools: BaseToolSpec[];
    status: 'idle' | 'loading' | 'error';
    defaultServer?: string;
  }>();

  const emit = defineEmits<{
    'toggle-enabled': [value: boolean];
    edit: [server: MCPServer];
    'set-default': [name: string];
    remove: [name: string];
  }>();

  const description = computed(() => {
    if (props.server.url) return props.server.url;
    if (props.server.command) return props.server.command;
    return '';
  });

  const commands = computed(() => (props.tools ?? []).map((tool) => tool.name));

  const isDefault = computed(() => props.defaultServer === props.server.name);

  function handleToggle(value: boolean) {
    emit('toggle-enabled', value);
  }

  function handleEdit() {
    emit('edit', props.server);
  }

  function handleSetDefault() {
    emit('set-default', props.server.name);
  }

  function handleRemove() {
    emit('remove', props.server.name);
  }
</script>

<template>
  <ToolModulePanel
    :title="server.name"
    :description="description"
    :enabled="server.enabled !== false"
    :loading="status === 'loading'"
    :commands="commands"
    @toggle="handleToggle"
  >
    <div class="server-meta">
      <div class="meta-line">
        <span class="label">{{ t('tools.add_server.connection_type') }}:</span>
        <span class="value">{{ server.type }}</span>
      </div>
      <div v-if="server.url" class="meta-line">
        <span class="label">URL:</span>
        <span class="value">{{ server.url }}</span>
      </div>
      <div v-else-if="server.command" class="meta-line">
        <span class="label">Command:</span>
        <span class="value mono">{{ server.command }}</span>
      </div>
      <div class="actions">
        <button class="btn" @click="handleEdit">{{ t('tools.edit') }}</button>
        <button class="btn" @click="handleSetDefault" :disabled="isDefault">
          {{ t('tools.set_as_default') }}
        </button>
        <button class="btn" @click="handleRemove">{{ t('tools.remove') }}</button>
      </div>
    </div>

    <div v-if="status === 'error'" class="error">{{ t('tools.failed_to_load') }}</div>
    <div v-else-if="tools.length" class="tools-list">
      <ToolItem v-for="tool in tools" :key="tool.name" :tool="tool" :show-parameters="true" />
    </div>
    <p v-else class="placeholder">{{ t('tools.no_tools') }}</p>
  </ToolModulePanel>
</template>

<style scoped>
  .server-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    > .meta-line {
      display: flex;
      gap: 0.5rem;
      font-size: 0.95rem;

      > .label {
        color: var(--muted);
        min-width: 120px;
      }

      > .value.mono {
        font-family: var(--font-mono);
      }
    }

    > .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;

      > .btn {
        padding: 0.35rem 0.75rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-elev);
        cursor: pointer;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .error {
    color: var(--error);
  }

  .placeholder {
    color: var(--muted);
  }
</style>
