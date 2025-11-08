<template>
  <div class="server-card" :class="{ builtin: isBuiltin, expanded }">
    <div class="server-header" @click="toggleExpanded">
      <div class="server-info">
        <span class="server-icon">{{ serverIcon }}</span>
        <div class="server-details">
          <h3 class="server-name">
            {{ displayName }}
            <span v-if="isDefault" class="badge-default">default</span>
            <span v-if="!isBuiltin && serverType" class="badge-type">{{ serverType }}</span>
          </h3>
          <span v-if="!isBuiltin && serverEndpoint" class="server-url">{{ serverEndpoint }}</span>
        </div>
      </div>
      <div class="server-meta">
        <span class="tool-count">{{ toolCount }} tools</span>
        <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
      </div>
    </div>

    <div v-if="expanded" class="server-content">
      <div v-if="loading" class="loading">Loading tools...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="tools.length > 0" class="tools-list">
        <ToolItem v-for="tool in tools" :key="tool.name" :tool="tool" :show-parameters="true" />
      </div>
      <div v-else class="empty">No tools available</div>

      <div v-if="!isBuiltin" class="server-actions">
        <button class="btn btn-sm" @click.stop="setAsDefault" :disabled="isDefault">
          Set as default
        </button>
        <button class="btn btn-sm btn-danger" @click.stop="removeServer">Remove</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import type { MCPServer } from '@stina/settings';
  import { computed, ref, watch } from 'vue';

  import ToolItem from './ToolItem.vue';

  const props = defineProps<{
    server: MCPServer | { name: string; type?: string; url?: string; command?: string };
    isBuiltin?: boolean;
    isDefault?: boolean;
    tools?: BaseToolSpec[];
  }>();

  const emit = defineEmits<{
    'set-default': [name: string];
    remove: [name: string];
    'load-tools': [
      server: MCPServer | { name: string; type?: string; url?: string; command?: string },
    ];
  }>();

  const expanded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const tools = ref<BaseToolSpec[]>(props.tools || []);

  const displayName = computed(() => {
    if (props.isBuiltin) return 'Built-in Tools';
    return props.server.name;
  });

  const serverIcon = computed(() => {
    if (props.isBuiltin) return '📦';
    if ('type' in props.server && props.server.type === 'stdio') return '⚡';
    return '📡';
  });

  const serverType = computed(() => {
    if (props.isBuiltin || !('type' in props.server)) return null;
    return props.server.type === 'stdio' ? 'stdio' : 'ws';
  });

  const serverEndpoint = computed(() => {
    if (props.isBuiltin) return null;
    if ('url' in props.server && props.server.url) return props.server.url;
    if ('command' in props.server && props.server.command) return props.server.command;
    return null;
  });

  const toolCount = computed(() => tools.value.length);

  async function toggleExpanded() {
    expanded.value = !expanded.value;

    // Load tools on first expand
    if (expanded.value && tools.value.length === 0 && !props.isBuiltin) {
      await loadTools();
    }
  }

  async function loadTools() {
    loading.value = true;
    error.value = null;

    try {
      emit('load-tools', props.server);
      // Tools will be updated via props
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load tools';
    } finally {
      loading.value = false;
    }
  }

  function setAsDefault() {
    emit('set-default', props.server.name);
  }

  function removeServer() {
    emit('remove', props.server.name);
  }

  // Watch for tools prop changes
  watch(
    () => props.tools,
    (newTools) => {
      if (newTools) {
        tools.value = newTools;
      }
    },
  );

  // Expand builtin by default
  if (props.isBuiltin && props.tools) {
    expanded.value = true;
    tools.value = props.tools;
  }
</script>

<style scoped>
  .server-card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: var(--space-3);
    overflow: hidden;
  }

  .server-card.builtin {
    border-color: var(--primary);
    border-width: 2px;
  }

  .server-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4);
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
  }

  .server-header:hover {
    background: var(--bg);
  }

  .server-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
  }

  .server-icon {
    font-size: var(--text-xl);
  }

  .server-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .server-name {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .server-url {
    font-size: var(--text-xs);
    color: var(--text-muted);
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
    word-break: break-all;
  }

  .badge-default {
    display: inline-block;
    padding: 2px 8px;
    background: var(--primary);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-type {
    display: inline-block;
    padding: 2px 6px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
  }

  .server-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .tool-count {
    font-size: var(--text-sm);
    color: var(--text-muted);
    font-weight: 600;
  }

  .expand-icon {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .server-content {
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  .tools-list {
    max-height: 500px;
    overflow-y: auto;
  }

  .loading,
  .error,
  .empty {
    padding: var(--space-4);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .error {
    color: var(--error);
  }

  .server-actions {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-4);
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: var(--space-2) var(--space-3);
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:hover:not(:disabled) {
    background: var(--primary);
    color: white;
    border-color: var(--primary);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--error);
    border-color: var(--error);
  }
</style>
