<template>
  <div class="wrap">
    <h2 class="title">MCP Servers</h2>
    <div class="row">
      <input class="input" v-model="form.name" placeholder="Name (e.g. local)" />
      <input class="input" v-model="form.url" placeholder="ws://localhost:3001" />
      <button class="btn" @click="save">Save</button>
    </div>

    <div class="list">
      <div class="item" v-for="s in viewServers" :key="s.name">
        <div class="meta">
          <strong>{{ s.name }}</strong>
          <span class="muted">{{ s.url }}</span>
          <span v-if="defaultName === s.name" class="badge">default</span>
        </div>
        <div class="actions">
          <button class="btn" @click="edit(s)" :disabled="s.readonly">Edit</button>
          <button class="btn" @click="setDefault(s)">Set default</button>
          <button class="btn warn" @click="remove(s)" :disabled="s.readonly">Remove</button>
          <button class="btn" @click="testList(s)">List tools</button>
        </div>
      </div>
      <div v-if="servers.length === 0" class="muted">No servers configured.</div>
    </div>

    <div v-if="lastTools !== null" class="tools">
      <h3>Tools on {{ lastServerName }}</h3>
      <pre class="pre">{{ formattedTools }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue';

  import type { MCPServer } from '@stina/settings';

  type Server = MCPServer;
  type ViewServer = Server & { readonly?: boolean };

  const servers = ref<Server[]>([]);
  const defaultName = ref<string | undefined>(undefined);
  const form = reactive<Server>({ name: '', url: '' });
  const viewServers = ref<ViewServer[]>([]);
  const lastTools = ref<unknown | null>(null);
  const lastServerName = ref<string>('');
  const formattedTools = computed(() => {
    if (lastTools.value == null) return 'Ingen data hämtad ännu.';
    if (typeof lastTools.value === 'string') return lastTools.value;
    try {
      return JSON.stringify(lastTools.value, null, 2);
    } catch {
      return String(lastTools.value);
    }
  });

  async function load() {
    const { servers: list, defaultServer } = await window.stina.mcp.getServers();
    servers.value = list;
    defaultName.value = defaultServer;
    viewServers.value = [{ name: 'local', url: 'local://builtin', readonly: true }, ...list];
  }

  function edit(s: Server) {
    form.name = s.name;
    form.url = s.url;
  }
  async function save() {
    if (!form.name || !form.url) return;
    await window.stina.mcp.upsertServer({ name: form.name, url: form.url });
    form.name = '';
    form.url = '';
    await load();
  }
  async function setDefault(s: Server) {
    await window.stina.mcp.setDefault(s.name);
    await load();
  }
  async function remove(s: Server) {
    await window.stina.mcp.removeServer(s.name);
    await load();
  }
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
