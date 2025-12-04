<script setup lang="ts">
  import { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import type { MCPServer } from '@stina/settings';
  import { computed, onMounted, ref, watch } from 'vue';

  import SimpleButton from '../components/buttons/SimpleButton.vue';
  import BaseModal from '../components/common/BaseModal.vue';
  import SubNav from '../components/nav/SubNav.vue';
  import MemoryList from '../components/settings/MemoryList.vue';
  import WeatherSettings from '../components/settings/WeatherSettings.vue';
  import WorkProjects from '../components/settings/WorkSettings.ProjectList.vue';
  import WorkRecurring from '../components/settings/WorkSettings.Recurring.vue';
  import WorkTodoSettings from '../components/settings/WorkSettings.TodoSettings.vue';
  import AddServerForm from '../components/tools/AddServerForm.vue';
  import ToolModulePanel from '../components/tools/ToolModulePanel.vue';

  import McpServerPanel from './ToolsView.McpServerPanel.vue';

  type ModuleKey = 'work' | 'weather' | 'memory' | 'tandoor' | 'core';
  type TabKey = ModuleKey | `mcp:${string}`;

  const moduleCommands = ref<Record<ModuleKey, string[]>>({
    work: [],
    weather: [],
    memory: [],
    tandoor: [],
    core: [],
  });

  const servers = ref<MCPServer[]>([]);
  const defaultServer = ref<string | undefined>(undefined);
  const serverToolsMap = ref<Map<string, BaseToolSpec[]>>(new Map());
  const serverStatus = ref<Map<string, 'idle' | 'loading' | 'error'>>(
    new Map<string, 'idle' | 'loading' | 'error'>(),
  );
  const activeTab = ref<TabKey>('work');
  const addServerOpen = ref(false);
  const editingServer = ref<MCPServer | null>(null);

  const navItems = computed(() => {
    const base = [
      { id: 'work', label: t('tools.modules.work.tab') },
      { id: 'weather', label: t('tools.modules.weather.tab') },
      { id: 'memory', label: t('tools.modules.memory.tab') },
      { id: 'tandoor', label: t('tools.modules.tandoor.tab') },
      { id: 'core', label: t('tools.modules.core.tab') },
    ];
    const serverItems = servers.value.map((srv) => {
      const status = serverStatus.value.get(srv.name);
      const suffix = status === 'error' ? ' ⚠' : status === 'loading' ? ' …' : '';
      return { id: `mcp:${srv.name}`, label: `${srv.name}${suffix}` };
    });
    return [...base, ...serverItems];
  });

  const activeServer = computed(() => getActiveServer());
  const activeServerDescription = computed(() => {
    const srv = activeServer.value;
    if (!srv) return '';
    if (srv.url) return srv.url;
    if (srv.command) return srv.command;
    return '';
  });

  const modules = ref<{ work: boolean; weather: boolean; memory: boolean; tandoor: boolean }>({
    work: true,
    weather: true,
    memory: true,
    tandoor: true,
  });
  const modulesLoading = ref(true);
  const modulesSaving = ref(false);

  const builtinTools = ref<BaseToolSpec[]>([]);
  const coreCommands = computed(() => {
    const taken = new Set(
      [
        ...moduleCommands.value.work,
        ...moduleCommands.value.weather,
        ...moduleCommands.value.memory,
        ...moduleCommands.value.tandoor,
      ].map((n) => n),
    );
    const coreList = moduleCommands.value.core.length
      ? moduleCommands.value.core
      : builtinTools.value.map((tool) => tool.name);
    return coreList.filter((name) => !taken.has(name)).sort();
  });

  const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);

  function isModuleEnabled(module: keyof typeof modules.value): boolean {
    return (modules.value?.[module] ?? true) !== false;
  }

  async function loadModules() {
    modulesLoading.value = true;
    try {
      const state = await window.stina.settings.getToolModules();
      modules.value = {
        work: state.todo !== false,
        weather: state.weather !== false,
        memory: state.memory !== false,
        tandoor: state.tandoor !== false,
      };
    } catch {
      modules.value = { work: true, weather: true, memory: true, tandoor: true };
    } finally {
      modulesLoading.value = false;
    }
  }

  async function loadServers() {
    try {
      const config = await window.stina.mcp.getServers();
      servers.value = config.servers ?? [];
      defaultServer.value = config.defaultServer;
      // Ensure active tab points to an existing item
      if (typeof activeTab.value === 'string' && activeTab.value.startsWith('mcp:')) {
        const name = activeTab.value.slice(4);
        if (!servers.value.find((s) => s.name === name)) {
          activeTab.value = 'work';
        }
      }
    } catch {
      servers.value = [];
    }
  }

  async function loadServerTools(server: MCPServer | { name: string }) {
    serverStatus.value.set(server.name, 'loading');
    if ('enabled' in server && server.enabled === false) {
      serverToolsMap.value.set(server.name, []);
      serverStatus.value.set(server.name, 'idle');
      return;
    }
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
      serverStatus.value.set(server.name, 'idle');
    } catch {
      serverToolsMap.value.set(server.name, []);
      serverStatus.value.set(server.name, 'error');
    }
  }

  function getActiveServer(): MCPServer | undefined {
    if (!activeTab.value.startsWith('mcp:')) return undefined;
    const name = activeTab.value.slice(4);
    return servers.value.find((s) => s.name === name);
  }

  async function toggleModule(module: keyof typeof modules.value, value: boolean) {
    modulesSaving.value = true;
    modules.value = { ...modules.value, [module]: value };
    try {
      if (module === 'work') {
        await window.stina.settings.updateToolModules({ todo: value });
      } else {
        await window.stina.settings.updateToolModules({ [module]: value });
      }
    } catch {
      notice.value = { kind: 'error', message: t('tools.modules.toggle_error') };
    } finally {
      modulesSaving.value = false;
    }
  }

  async function handleSaveServer(serverData: {
    name: string;
    type: string;
    url?: string;
    command?: string;
    oauth?: MCPServer['oauth'];
  }) {
    try {
      const enabled = editingServer.value?.enabled ?? true;
      await window.stina.mcp.upsertServer({ ...serverData, enabled });
      await loadServers();
      addServerOpen.value = false;
      editingServer.value = null;
      activeTab.value = `mcp:${serverData.name}`;
      await loadServerTools({ name: serverData.name });
    } catch {
      notice.value = { kind: 'error', message: t('tools.add_server_error') };
    }
  }

  async function handleSetDefault(name: string) {
    try {
      await window.stina.mcp.setDefault(name);
      await loadServers();
    } catch {
      notice.value = { kind: 'error', message: t('tools.set_default_error') };
    }
  }

  async function handleRemoveServer(name: string) {
    try {
      await window.stina.mcp.removeServer(name);
      serverToolsMap.value.delete(name);
      await loadServers();
      if (activeTab.value === `mcp:${name}`) activeTab.value = 'work';
    } catch {
      notice.value = { kind: 'error', message: t('tools.remove_server_error') };
    }
  }

  async function handleToggleEnabled(server: MCPServer, value?: boolean) {
    try {
      const nextEnabled = value ?? server.enabled === false;
      await window.stina.mcp.upsertServer({ ...server, enabled: nextEnabled });
      await loadServers();
      if (nextEnabled === false) {
        serverToolsMap.value.delete(server.name);
        serverStatus.value.set(server.name, 'idle');
      } else {
        await loadServerTools(server);
      }
    } catch {
      notice.value = { kind: 'error', message: t('tools.set_default_error') };
    }
  }

  function openAddModal(server?: MCPServer) {
    editingServer.value = server ?? null;
    addServerOpen.value = true;
  }

  function closeAddModal() {
    addServerOpen.value = false;
    editingServer.value = null;
  }

  /**
   * Loads builtin tools by calling list_tools with server=local.
   */
  async function loadBuiltinTools() {
    try {
      const catalog = await window.stina.tools.getModulesCatalog?.();
      if (catalog) {
        moduleCommands.value = {
          work: (catalog.todo ?? []).map((t) => t.name),
          weather: (catalog.weather ?? []).map((t) => t.name),
          memory: (catalog.memory ?? []).map((t) => t.name),
          tandoor: (catalog.tandoor ?? []).map((t) => t.name),
          core: (catalog.core ?? []).map((t) => t.name),
        };
      }
      const result = await window.stina.mcp.listTools('local');
      if (Array.isArray(result)) {
        builtinTools.value = result;
      } else if (result && typeof result === 'object' && 'tools' in result) {
        builtinTools.value = (result as any).tools || [];
      }
    } catch {
      builtinTools.value = [];
    }
  }

  async function initialize() {
    await Promise.all([loadModules(), loadBuiltinTools(), loadServers()]);
  }

  onMounted(() => {
    void initialize();
  });

  watch(
    () => activeTab.value,
    async (tab) => {
      if (typeof tab === 'string' && tab.startsWith('mcp:')) {
        const server = getActiveServer();
        if (server && !serverToolsMap.value.has(server.name)) {
          await loadServerTools(server);
        }
      }
    },
  );
</script>

<template>
  <div class="tools-view">
    <SubNav class="navigation" v-model="activeTab" :items="navItems" :aria-label="t('tools.title')">
      <SimpleButton
        class="add-btn"
        @click="openAddModal()"
        :aria-label="t('tools.add_tool_button')"
      >
        {{ t('tools.add_tool_button') }}
      </SimpleButton>
    </SubNav>

    <div class="content">
      <div v-if="notice" class="notice" :class="notice.kind">{{ notice.message }}</div>

      <ToolModulePanel
        v-if="activeTab === 'work'"
        :title="t('tools.modules.work.title')"
        :description="t('tools.modules.work.description')"
        :enabled="isModuleEnabled('work')"
        :loading="modulesLoading || modulesSaving"
        :commands="moduleCommands.work"
        @toggle="toggleModule('work', $event)"
      >
        <WorkTodoSettings />
        <WorkRecurring />
        <WorkProjects />
      </ToolModulePanel>

      <ToolModulePanel
        v-else-if="activeTab === 'weather'"
        :title="t('tools.modules.weather.title')"
        :description="t('tools.modules.weather.description')"
        :enabled="isModuleEnabled('weather')"
        :loading="modulesLoading || modulesSaving"
        :commands="moduleCommands.weather"
        @toggle="toggleModule('weather', $event)"
      >
        <WeatherSettings />
      </ToolModulePanel>

      <ToolModulePanel
        v-else-if="activeTab === 'memory'"
        :title="t('tools.modules.memory.title')"
        :description="t('tools.modules.memory.description')"
        :enabled="isModuleEnabled('memory')"
        :loading="modulesLoading || modulesSaving"
        :commands="moduleCommands.memory"
        @toggle="toggleModule('memory', $event)"
      >
        <MemoryList />
      </ToolModulePanel>

      <ToolModulePanel
        v-else-if="activeTab === 'tandoor'"
        :title="t('tools.modules.tandoor.title')"
        :description="t('tools.modules.tandoor.description')"
        :enabled="isModuleEnabled('tandoor')"
        :loading="modulesLoading || modulesSaving"
        :commands="moduleCommands.tandoor"
        @toggle="toggleModule('tandoor', $event)"
      >
        <p class="placeholder">{{ t('tools.modules.tandoor.placeholder') }}</p>
      </ToolModulePanel>

      <ToolModulePanel
        v-else-if="activeTab === 'core'"
        :title="t('tools.modules.core.title')"
        :description="t('tools.modules.core.description')"
        :enabled="undefined"
        :commands="coreCommands"
      >
        <p class="placeholder">{{ t('tools.modules.core.hint') }}</p>
      </ToolModulePanel>

      <McpServerPanel
        v-else-if="typeof activeTab === 'string' && activeTab.startsWith('mcp:') && activeServer"
        :key="activeServer!.name"
        :server="activeServer!"
        :tools="serverToolsMap.get(activeServer!.name) || []"
        :status="serverStatus.get(activeServer!.name) || 'idle'"
        :default-server="defaultServer"
        @toggle-enabled="handleToggleEnabled(activeServer!, $event)"
        @edit="openAddModal(activeServer!)"
        @set-default="handleSetDefault"
        @remove="handleRemoveServer"
      />
    </div>

    <BaseModal
      :open="addServerOpen"
      :title="editingServer ? t('tools.edit_server_title') : t('tools.add_server.title')"
      :close-label="t('tools.add_server.cancel')"
      max-width="800px"
      @close="closeAddModal"
    >
      <AddServerForm
        :initial-server="editingServer || undefined"
        :auto-expand="true"
        :expandable="false"
        @save="handleSaveServer"
        @cancel="closeAddModal"
      />
    </BaseModal>
  </div>
</template>

<style scoped>
  .tools-view {
    display: grid;
    grid-template-columns: 220px 1fr;
    height: 100%;
    overflow: hidden;

    > .content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 2.5rem 3rem;
      overflow-y: auto;
    }
  }

  .notice {
    padding: 0.75rem 1rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .notice.success {
    background: rgba(16, 185, 129, 0.12);
    color: #065f46;
    border-color: rgba(16, 185, 129, 0.4);
  }

  .notice.error {
    background: rgba(239, 68, 68, 0.12);
    color: #7f1d1d;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.5rem;

    > .title {
      margin: 0;
      font-size: var(--text-2xl);
    }

    > .subtitle {
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
    }
  }

  .placeholder {
    margin: 0;
    color: var(--muted);
  }
</style>
