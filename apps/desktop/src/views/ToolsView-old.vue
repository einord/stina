<template>
  <div class="tools-view">
    <div class="tools-header">
      <h2 class="title">🔧 Tool Servers & Available Tools</h2>
      <p class="subtitle">
        Manage MCP servers and explore available tools that the AI assistant can use.
      </p>
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
        <h3 class="section-title">MCP Servers</h3>
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
        <p class="empty-message">No MCP servers configured yet.</p>
        <p class="empty-hint">Add a server above to get started.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';

  import type { BaseToolSpec } from '@stina/core';
  import type { MCPServer } from '@stina/settings';

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
      console.error('Failed to load builtin tools:', err);
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
      console.error('Failed to load servers:', err);
    }
  }

  /**
   * Loads tools for a specific server.
   */
  async function loadServerTools(server: MCPServer) {
    try {
      const result = await window.stina.mcp.listTools(server.url);
      let tools: BaseToolSpec[] = [];

      if (Array.isArray(result)) {
        tools = result;
      } else if (result && typeof result === 'object') {
        if ('tools' in result) {
          tools = (result as any).tools || [];
        } else if ('ok' in result && (result as any).ok) {
          // Handle {ok: true, tools: [...]} format
          tools = (result as any).tools || [];
        }
      }

      serverToolsMap.value.set(server.name, tools);
    } catch (err) {
      console.error(`Failed to load tools for ${server.name}:`, err);
      serverToolsMap.value.set(server.name, []);
    }
  }

  /**
   * Adds a new MCP server.
   */
  async function addServer(serverData: { name: string; url: string }) {
    try {
      await window.stina.mcp.upsertServer(serverData);
      await loadServers();
    } catch (err) {
      console.error('Failed to add server:', err);
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
      console.error('Failed to set default server:', err);
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
      console.error('Failed to remove server:', err);
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

  async function testList(s: Server) {
    lastTools.value = await window.stina.mcp.listTools(s.name);
    lastServerName.value = s.name;
  }

  onMounted(load);
</script>

<style scoped>
  .wrap {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-4);
  }
  .title {
    margin: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 200px 1fr auto;
    gap: var(--space-2);
  }
  .input {
    padding: var(--space-2);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-2);
  }
  .btn {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-2);
  }
  .btn.warn {
    color: #b91c1c;
  }
  .list {
    display: grid;
    gap: var(--space-2);
  }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-2);
    background: var(--bg-elev);
  }
  .meta {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  .muted {
    color: var(--muted);
  }
  .badge {
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: var(--text-xs);
  }
  .tools {
    border-top: 1px solid var(--border);
    padding-top: var(--space-2);
  }
  .pre {
    background: var(--bg-elev);
    padding: var(--space-2);
    border-radius: var(--radius-2);
    overflow: auto;
  }
</style>
