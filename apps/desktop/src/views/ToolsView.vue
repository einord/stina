<script setup lang="ts">
  import { BaseToolSpec } from '@stina/core';
  import { t } from '@stina/i18n';
  import { computed, onMounted, ref } from 'vue';

  import SubNav from '../components/nav/SubNav.vue';
  import MemoryList from '../components/settings/MemoryList.vue';
  import WeatherSettings from '../components/settings/WeatherSettings.vue';
  import WorkProjects from '../components/settings/WorkSettings.ProjectList.vue';
  import WorkRecurring from '../components/settings/WorkSettings.Recurring.vue';
  import WorkTodoSettings from '../components/settings/WorkSettings.TodoSettings.vue';
  import McpPanel from '../components/tools/McpPanel.vue';
  import ToolModulePanel from '../components/tools/ToolModulePanel.vue';

  type ModuleKey = 'work' | 'weather' | 'memory' | 'tandoor' | 'core' | 'mcp';

  const navItems = computed(() => [
    { id: 'work', label: t('tools.modules.work.tab') },
    { id: 'weather', label: t('tools.modules.weather.tab') },
    { id: 'memory', label: t('tools.modules.memory.tab') },
    { id: 'tandoor', label: t('tools.modules.tandoor.tab') },
    { id: 'core', label: t('tools.modules.core.tab') },
    { id: 'mcp', label: t('tools.modules.mcp.tab') },
  ]);

  const MODULE_COMMANDS: Record<ModuleKey, string[]> = {
    work: [
      'todo_list',
      'todo_add',
      'todo_update',
      'todo_comment_add',
      'project_list',
      'project_add',
      'project_update',
      'project_delete',
      'recurring_list',
      'recurring_add',
      'recurring_update',
      'recurring_delete',
    ],
    weather: ['weather_current', 'weather_set_location'],
    memory: [
      'memory_get_all',
      'memory_get_details',
      'memory_add',
      'memory_update',
      'memory_delete',
    ],
    tandoor: [
      'tandoor_get_todays_meal',
      'tandoor_get_weekly_menu',
      'tandoor_smart_shopping_list',
      'tandoor_add_to_shopping_list',
      'tandoor_get_shopping_list',
      'tandoor_import_recipe',
      'tandoor_search_recipes',
      'tandoor_get_recipe',
      'tandoor_suggest_skip',
      'tandoor_get_meal_plans',
      'tandoor_get_cook_log',
    ],
    core: [],
    mcp: [],
  };

  const activeTab = ref<ModuleKey>('work');

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
        ...MODULE_COMMANDS.work,
        ...MODULE_COMMANDS.weather,
        ...MODULE_COMMANDS.memory,
        ...MODULE_COMMANDS.tandoor,
      ].map((n) => n),
    );
    return builtinTools.value
      .map((tool) => tool.name)
      .filter((name) => !taken.has(name))
      .sort();
  });

  const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);

  function isModuleEnabled(module: keyof typeof modules.value): boolean {
    return modules.value[module] !== false;
  }

  async function loadModules() {
    modulesLoading.value = true;
    try {
      const state = await window.stina.settings.getToolModules();
      modules.value = {
        todo: state.todo !== false,
        weather: state.weather !== false,
        memory: state.memory !== false,
        tandoor: state.tandoor !== false,
      };
    } catch {
      modules.value = { todo: true, weather: true, memory: true, tandoor: true };
    } finally {
      modulesLoading.value = false;
    }
  }

  async function toggleModule(module: keyof typeof modules.value, value: boolean) {
    modulesSaving.value = true;
    modules.value = { ...modules.value, [module]: value };
    try {
      await window.stina.settings.updateToolModules({ [module]: value });
    } catch {
      notice.value = { kind: 'error', message: t('tools.modules.toggle_error') };
    } finally {
      modulesSaving.value = false;
    }
  }

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
    } catch {
      builtinTools.value = [];
    }
  }

  async function initialize() {
    await Promise.all([loadModules(), loadBuiltinTools()]);
  }

  onMounted(() => {
    void initialize();
  });
</script>

<template>
  <div class="tools-view">
    <SubNav v-model="activeTab" :items="navItems" :aria-label="t('tools.title')" />
    <div class="content">
      <ToolModulePanel
        v-if="activeTab === 'work'"
        :title="t('tools.modules.work.title')"
        :description="t('tools.modules.work.description')"
        :enabled="isModuleEnabled('work')"
        :loading="modulesLoading || modulesSaving"
        :commands="MODULE_COMMANDS.work"
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
        :commands="MODULE_COMMANDS.weather"
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
        :commands="MODULE_COMMANDS.memory"
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
        :commands="MODULE_COMMANDS.tandoor"
        @toggle="toggleModule('tandoor', $event)"
      >
        <p class="placeholder">{{ t('tools.modules.tandoor.placeholder') }}</p>
      </ToolModulePanel>

      <ToolModulePanel
        v-else-if="activeTab === 'core'"
        :title="t('tools.modules.core.title')"
        :description="t('tools.modules.core.description')"
        :enabled="true"
        :commands="coreCommands"
      >
        <p class="placeholder">{{ t('tools.modules.core.hint') }}</p>
      </ToolModulePanel>

      <McpPanel v-else-if="activeTab === 'mcp'" />
    </div>
  </div>
</template>

<style scoped>
  .tools-view {
    display: grid;
    grid-template-columns: 220px 1fr;
    height: 100%;
    overflow: hidden;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 2.5rem 3rem;
    overflow-y: auto;
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
