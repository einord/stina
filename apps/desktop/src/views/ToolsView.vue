<template>
  <div class="tools-view">
    <div class="tools-header">
      <h2 class="title">🔧 {{ t('tools.title') }}</h2>
      <p class="subtitle">{{ t('tools.subtitle') }}</p>
    </div>

    <div class="tools-content">
      <!-- Built-in tools always first -->
      <ToolServerCard
        v-if="builtinTools.length > 0"
        :server="{ name: 'builtin', url: 'local://builtin' }"
        :is-builtin="true"
        :tools="builtinTools"
      />

      <!-- Add server form -->
      <AddServerForm @save="addServer" />

      <!-- MCP Servers section -->
      <div v-if="mcpServers.length > 0" class="servers-section">
        <h3 class="section-title">{{ t('tools.mcp_servers') }}</h3>
        <ToolServerCard
          v-for="server in mcpServers"
          :key="server.name"
          :server="server"
          :is-default="server.name === defaultServer"
          :tools="serverToolsMap.get(server.name)"
          @set-default="setDefaultServer"
          @remove="removeServer"
          @load-tools="loadServerTools"
        />
      </div>

      <div v-else-if="!loading" class="empty-state">
        <p class="empty-message">{{ t('tools.no_servers') }}</p>
        <p class="empty-hint">{{ t('tools.add_server_hint') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';
  import { onMounted, ref } from 'vue';

  import AddServerForm from '../components/tools/AddServerForm.vue';
  import ToolServerCard from '../components/tools/ToolServerCard.vue';

  const loading = ref(true);
  const builtinTools = ref<BaseToolSpec[]>([]);
  const mcpServers = ref<MCPServer[]>([]);
  const defaultServer = ref<string | undefined>(undefined);
  const serverToolsMap = ref<Map<string, BaseToolSpec[]>>(new Map());

  /**
   * Loads builtin tools by calling list_tools with server=local.
   */
  async function loadBuiltinTools() {
    try {
      const result = await window.stina.mcp.listTools('local');
      if (Array.isArray(result)) {
        builtinTools.value = result;
      } else if (result && typeof result === 'object' && 'tools' in result) {
        builtinTools.value = (result as any).tools || [];
      }
    } catch (err) {
      // Silent fail for builtin tools
      builtinTools.value = [];
    }
  }

  /**
   * Loads all configured MCP servers.
   */
  async function loadServers() {
    try {
      const config = await window.stina.mcp.getServers();
      mcpServers.value = config.servers;
      defaultServer.value = config.defaultServer;
    } catch (err) {
      // Silent fail
      mcpServers.value = [];
    }
  }

  /**
   * Loads tools for a specific server.
   */
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
    } catch (err) {
      serverToolsMap.value.set(server.name, []);
    }
  }

  /**
   * Adds a new MCP server.
   */
  async function addServer(serverData: {
    name: string;
    type: string;
    url?: string;
    command?: string;
  }) {
    try {
      await window.stina.mcp.upsertServer(serverData);
      await loadServers();
    } catch (err) {
      // Silent fail - could show toast notification here
    }
  }

  /**
   * Sets a server as the default.
   */
  async function setDefaultServer(name: string) {
    try {
      await window.stina.mcp.setDefault(name);
      await loadServers();
    } catch (err) {
      // Silent fail
    }
  }

  /**
   * Removes a server.
   */
  async function removeServer(name: string) {
    try {
      await window.stina.mcp.removeServer(name);
      serverToolsMap.value.delete(name);
      await loadServers();
    } catch (err) {
      // Silent fail
    }
  }

  /**
   * Initializes the view by loading builtin tools and servers.
   */
  async function initialize() {
    loading.value = true;
    await Promise.all([loadBuiltinTools(), loadServers()]);
    loading.value = false;
  }

  onMounted(() => {
    initialize();
  });
</script>

<style scoped>
  .tools-view {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .tools-header {
    padding: var(--space-6) var(--space-6) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .title {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--text);
  }

  .subtitle {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.5;
  }

  .tools-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-6);
  }
  .servers-section {
    margin-top: var(--space-2);
  }

  .section-title {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .empty-state {
    padding: var(--space-8);
    text-align: center;
  }

  .empty-message {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--text-base);
    color: var(--text);
    font-weight: 600;
  }

  .empty-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
