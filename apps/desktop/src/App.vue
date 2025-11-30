<template>
  <div class="app-shell">
    <header class="window-header">
      <h1 class="window-title">Stina</h1>
      <div class="window-action">
        <IconToggleButton
          :icon="TodoIcon"
          tooltip="Visa att göra-listan"
          :active="todoPanelOpen"
          @click="toggleTodoPanel"
        />
      </div>
    </header>
    <MainLayout
      class="app-main"
      v-model:value="active"
      :todo-panel-visible="todoPanelOpen"
      @close-todo-panel="closeTodoPanel"
    >
      <template #default>
        <component :is="currentView" v-bind="currentViewProps" />
      </template>
      <template #todo-panel>
        <TodoPanel v-if="todoPanelOpen" />
      </template>
    </MainLayout>
  </div>
</template>

<script setup lang="ts">
  import TodoIcon from '~icons/hugeicons/check-list';

  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import MainLayout from './components/layout/MainLayout.vue';
  import TodoPanel from './components/todos/TodoPanel.vue';
  import IconToggleButton from './components/ui/IconToggleButton.vue';
  import type { SettingsNavigationTarget } from './lib/settingsNavigation';
  import { onSettingsNavigation } from './lib/settingsNavigation';
  import { initTheme } from './lib/theme';
  import ChatView from './views/ChatView.vue';
  import SettingsView from './views/SettingsView.vue';
  import ToolsView from './views/ToolsView.vue';

  const active = ref<'chat' | 'tools' | 'settings'>('chat');
  const map = {
    chat: ChatView,
    tools: ToolsView,
    settings: SettingsView,
  } as const;
  const currentView = computed(() => map[active.value]);
  const settingsTarget = ref<SettingsNavigationTarget | null>(null);
  const currentViewProps = computed(() =>
    active.value === 'settings' ? { target: settingsTarget.value } : {},
  );
  const todoPanelOpen = ref(false);
  let disposeSettingsNav: (() => void) | null = null;

  async function toggleTodoPanel() {
    todoPanelOpen.value = !todoPanelOpen.value;
    await window.stina.desktop.setTodoPanelOpen(todoPanelOpen.value);
  }

  /**
   * Stänger todo-panelen (anropas när användaren drar ner panelen under tröskelvärdet).
   */
  async function closeTodoPanel() {
    todoPanelOpen.value = false;
    await window.stina.desktop.setTodoPanelOpen(false);
  }

  /**
   * Handles deep links into the settings view (e.g. opening a specific recurring template).
   */
  function handleSettingsNavigation(target: SettingsNavigationTarget) {
    active.value = 'settings';
    settingsTarget.value = null;
    settingsTarget.value = { ...target };
  }

  onMounted(async () => {
    initTheme('light');
    // Återställ todo-panelens senaste status
    todoPanelOpen.value = await window.stina.desktop.getTodoPanelOpen();

    disposeSettingsNav = onSettingsNavigation(handleSettingsNavigation);
  });

  onUnmounted(() => {
    disposeSettingsNav?.();
  });
</script>

<style scoped>
  :host,
  .app-shell,
  .app-main {
    height: 100%;
  }
  .app-shell {
    display: flex;
    flex-direction: column;
  }
  .window-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1em;
    -webkit-app-region: drag;
  }
  .window-title {
    margin: 0;
    font-size: 1rem;
    font-weight: var(--font-weight-medium);
    color: var(--text);
    flex: 1 1;
    margin-left: 70px;
    /* text-align: center; */
  }
  .window-action {
    right: 4em;
    top: 2em;
    display: flex;
    align-items: center;
    gap: 2em;
    -webkit-app-region: no-drag;
  }
  .app-main {
    flex: 1;
    min-height: 0;
    /* display: none; */
  }
</style>
