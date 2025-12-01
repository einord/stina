<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';
  import { onMounted, ref } from 'vue';

  import AddServerForm from './AddServerForm.vue';
  import ToolServerCard from './ToolServerCard.vue';

  const mcpServers = ref<MCPServer[]>([]);
  const defaultServer = ref<string | undefined>(undefined);
  const serverToolsMap = ref<Map<string, BaseToolSpec[]>>(new Map());
  const oauthConnectBusy = ref<string | null>(null);
  const oauthClearBusy = ref<string | null>(null);
  const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);

  function setNotice(kind: 'success' | 'error', key: string) {
    const message = t(key);
    notice.value = { kind, message };
    setTimeout(() => {
      if (notice.value?.message === message) {
        notice.value = null;
      }
    }, 5000);
  }

  async function loadServers() {
    try {
      const config = await window.stina.mcp.getServers();
      mcpServers.value = config.servers;
      defaultServer.value = config.defaultServer;
    } catch {
      mcpServers.value = [];
    }
  }

  async function loadServerTools(
    server: MCPServer | { name: string; type?: string; url?: string; command?: string },
  ) {
    try {
      const result = await window.stina.mcp.listTools(server.name);
      let tools: BaseToolSpec[] = [];

      if (Array.isArray(result)) {
        tools = result;
      } else if (result && typeof result === 'object') {
        if ('tools' in result) {
          tools = (result as any).tools || [];
        } else if ('ok' in result && (result as any).ok) {
          tools = (result as any).tools || [];
        }
      }

      serverToolsMap.value.set(server.name, tools);
    } catch {
      serverToolsMap.value.set(server.name, []);
    }
  }

  async function addServer(serverData: {
    name: string;
    type: string;
    url?: string;
    command?: string;
    oauth?: MCPServer['oauth'];
  }) {
    try {
      await window.stina.mcp.upsertServer(serverData);
      await loadServers();
    } catch {
      setNotice('error', 'tools.add_server_error');
    }
  }

  async function setDefaultServer(name: string) {
    try {
      await window.stina.mcp.setDefault(name);
      await loadServers();
    } catch {
      setNotice('error', 'tools.set_default_error');
    }
  }

  async function removeServer(name: string) {
    try {
      await window.stina.mcp.removeServer(name);
      serverToolsMap.value.delete(name);
      await loadServers();
    } catch {
      setNotice('error', 'tools.remove_server_error');
    }
  }

  async function connectOAuth(name: string) {
    oauthConnectBusy.value = name;
    try {
      await window.stina.mcp.startOAuth(name);
      await loadServers();
      setNotice('success', 'tools.oauth.connect_success');
    } catch {
      setNotice('error', 'tools.oauth.connect_error');
    } finally {
      oauthConnectBusy.value = null;
    }
  }

  async function clearOAuth(name: string) {
    oauthClearBusy.value = name;
    try {
      await window.stina.mcp.clearOAuth(name);
      await loadServers();
      setNotice('success', 'tools.oauth.clear_success');
    } catch {
      setNotice('error', 'tools.oauth.clear_error');
    } finally {
      oauthClearBusy.value = null;
    }
  }

  onMounted(() => {
    void loadServers();
  });
</script>

<template>
  <div class="mcp-panel">
    <div v-if="notice" class="notice" :class="notice.kind">
      {{ notice.message }}
    </div>

    <AddServerForm @save="addServer" />

    <div v-if="mcpServers.length > 0" class="servers-section">
      <h3 class="section-title">{{ t('tools.mcp_servers') }}</h3>
      <ToolServerCard
        v-for="server in mcpServers"
        :key="server.name"
        :server="server"
        :is-default="server.name === defaultServer"
        :tools="serverToolsMap.get(server.name)"
        :oauth-loading="oauthConnectBusy === server.name"
        :oauth-clearing="oauthClearBusy === server.name"
        @set-default="setDefaultServer"
        @remove="removeServer"
        @load-tools="loadServerTools"
        @connect-oauth="connectOAuth"
        @clear-oauth="clearOAuth"
      />
    </div>

    <div v-else class="empty-state">
      <p class="empty-message">{{ t('tools.no_servers') }}</p>
      <p class="empty-hint">{{ t('tools.add_server_hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
  .mcp-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;

    > .notice {
      padding: 1rem;
      border-radius: var(--border-radius-normal);
      font-size: 0.9rem;
      border: 1px solid var(--border);

      &.success {
        background: rgba(16, 185, 129, 0.12);
        color: #065f46;
      }

      &.error {
        background: rgba(239, 68, 68, 0.12);
        color: #7f1d1d;
      }
    }

    > .servers-section {
      display: flex;
      flex-direction: column;
      gap: 1rem;

      > .section-title {
        margin: 0;
        font-size: 1rem;
        color: var(--muted);
      }
    }

    > .empty-state {
      padding: var(--space-8);
      text-align: center;
      border: 1px dashed var(--border);
      border-radius: var(--border-radius-normal);
      background: var(--panel);

      > .empty-message {
        margin: 0 0 0.5rem 0;
        font-weight: var(--font-weight-medium);
      }

      > .empty-hint {
        margin: 0;
        color: var(--muted);
      }
    }
  }
</style>
