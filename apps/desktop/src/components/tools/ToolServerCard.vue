<template>
  <div class="server-card" :class="{ builtin: isBuiltin, expanded }">
    <div class="server-header" @click="toggleExpanded">
      <div class="server-info">
        <span class="server-icon">{{ serverIcon }}</span>
        <div class="server-details">
          <h3 class="server-name">
            {{ displayName }}
            <span v-if="isDefault" class="badge-default">{{ t('tools.default_badge') }}</span>
            <span v-if="!isBuiltin && serverType" class="badge-type">{{ serverType }}</span>
          </h3>
          <span v-if="!isBuiltin && serverEndpoint" class="server-url">{{ serverEndpoint }}</span>
        </div>
      </div>
      <div class="server-meta">
        <span class="tool-count">{{ t('tools.tool_count', { count: String(toolCount) }) }}</span>
        <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
      </div>
    </div>

    <div v-if="expanded" class="server-content">
      <div v-if="loading" class="loading">{{ t('tools.loading_tools') }}</div>
      <div v-else-if="error" class="error">{{ t('tools.failed_to_load') }}</div>
      <div v-else-if="tools.length > 0" class="tools-list">
        <ToolItem v-for="tool in tools" :key="tool.name" :tool="tool" :show-parameters="true" />
      </div>
      <div v-else class="empty">{{ t('tools.no_tools') }}</div>

      <div v-if="hasOAuthConfig && !isBuiltin" class="oauth-panel" aria-live="polite">
        <div class="oauth-status">
          <span class="label">{{ t('tools.oauth.title') }}</span>
          <span class="status-chip" :class="{ connected: oauthConnected, expired: oauthExpired }">
            {{ oauthStatusLabel }}
          </span>
          <span v-if="oauthExpiryText" class="expires">{{ oauthExpiryText }}</span>
        </div>
        <div class="oauth-actions">
          <button class="btn btn-sm" @click.stop="connectOAuth" :disabled="oauthLoading">
            {{ oauthConnected ? t('tools.oauth.reconnect') : t('tools.oauth.connect') }}
          </button>
          <button
            class="btn btn-sm"
            @click.stop="clearOAuth"
            :disabled="oauthClearing || !oauthConnected"
          >
            {{ t('tools.oauth.disconnect') }}
          </button>
        </div>
      </div>

      <div v-if="!isBuiltin" class="server-actions">
        <button class="btn btn-sm" @click.stop="setAsDefault" :disabled="isDefault">
          {{ t('tools.set_as_default') }}
        </button>
        <button class="btn btn-sm btn-danger" @click.stop="removeServer">
          {{ t('tools.remove') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';
  import { computed, ref, watch } from 'vue';

  import ToolItem from './ToolItem.vue';

  const props = defineProps<{
    server: MCPServer | { name: string; type?: string; url?: string; command?: string };
    isBuiltin?: boolean;
    isDefault?: boolean;
    tools?: BaseToolSpec[];
    oauthLoading?: boolean;
    oauthClearing?: boolean;
  }>();

  const emit = defineEmits<{
    'set-default': [name: string];
    remove: [name: string];
    'load-tools': [
      server: MCPServer | { name: string; type?: string; url?: string; command?: string },
    ];
    'connect-oauth': [name: string];
    'clear-oauth': [name: string];
  }>();

  const expanded = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const tools = ref<BaseToolSpec[]>(props.tools || []);

  const displayName = computed(() => {
    if (props.isBuiltin) return t('tools.builtin');
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

  const oauthConfig = computed(() => {
    if (props.isBuiltin) return undefined;
    if ('oauth' in props.server) return props.server.oauth;
    return undefined;
  });
  const hasOAuthConfig = computed(() => Boolean(oauthConfig.value));
  const oauthStatus = computed(() => oauthConfig.value?.tokenStatus);
  const oauthLoading = computed(() => props.oauthLoading ?? false);
  const oauthClearing = computed(() => props.oauthClearing ?? false);
  const oauthConnected = computed(() => Boolean(oauthStatus.value?.hasAccessToken));
  const oauthExpired = computed(() => {
    if (!oauthStatus.value?.expiresAt) return false;
    return oauthStatus.value.expiresAt <= Date.now();
  });
  const oauthStatusLabel = computed(() => {
    if (!hasOAuthConfig.value) return t('tools.oauth.not_configured');
    if (!oauthConnected.value) return t('tools.oauth.disconnected');
    if (oauthExpired.value) return t('tools.oauth.expired');
    return t('tools.oauth.connected');
  });
  const oauthExpiryText = computed(() => {
    if (!oauthStatus.value?.expiresAt || oauthExpired.value) return null;
    const dt = new Date(oauthStatus.value.expiresAt);
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return t('tools.oauth.expires_at', { date: formatter.format(dt) });
  });

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

  function connectOAuth() {
    emit('connect-oauth', props.server.name);
  }

  function clearOAuth() {
    emit('clear-oauth', props.server.name);
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
    margin-bottom: 3em;
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
    padding: 4em;
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
  }

  .server-header:hover {
    background: var(--empty-bg);
  }

  .server-info {
    display: flex;
    align-items: center;
    gap: 3em;
    flex: 1;
  }

  .server-icon {
    font-size: var(--text-xl);
  }

  .server-details {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .server-name {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 2em;
  }

  .server-url {
    font-size: 0.5rem;
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
    font-size: 0.5rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-type {
    display: inline-block;
    padding: 2px 6px;
    background: var(--empty-bg);
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    font-size: 0.5rem;
    font-weight: 500;
    font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
  }

  .server-meta {
    display: flex;
    align-items: center;
    gap: 3em;
  }

  .tool-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .expand-icon {
    color: var(--text-muted);
    font-size: 0.5rem;
  }

  .server-content {
    border-top: 1px solid var(--border);
    background: var(--empty-bg);
  }

  .oauth-panel {
    border-top: 1px solid var(--border);
    padding: 4em;
    display: flex;
    flex-direction: column;
    gap: 3em;
    background: var(--empty-bg);
  }

  .oauth-status {
    display: flex;
    align-items: center;
    gap: 2em;
    flex-wrap: wrap;
  }

  .oauth-status .label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .status-chip {
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: 0.5rem;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    text-transform: uppercase;
  }

  .status-chip.connected {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.4);
    color: #065f46;
  }

  .status-chip.expired {
    background: rgba(251, 191, 36, 0.2);
    border-color: rgba(251, 191, 36, 0.4);
    color: #92400e;
  }

  .oauth-status .expires {
    font-size: 0.5rem;
    color: var(--text-muted);
  }

  .oauth-actions {
    display: flex;
    gap: 2em;
  }

  .loading,
  .error,
  .empty {
    padding: 4em;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .error {
    color: var(--error);
  }

  .server-actions {
    display: flex;
    gap: 2em;
    padding: 4em;
    border-top: 1px solid var(--border);
  }

  .btn {
    padding: 2em 3em;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 0.75rem;
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
    padding: 1em 2em;
    font-size: 0.5rem;
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--error);
    border-color: var(--error);
  }
</style>
