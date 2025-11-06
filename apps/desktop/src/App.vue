<template>
  <div class="app-shell">
    <div class="titlebar-spacer" />
    <MainLayout class="app-main" v-model:value="active">
      <template #default>
        <component :is="currentView" />
      </template>
    </MainLayout>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';

  import MainLayout from './components/layout/MainLayout.vue';
  import { initTheme } from './lib/theme';
  import ChatView from './views/ChatView.vue';
  import SettingsView from './views/SettingsView.vue';
  import TodosView from './views/TodosView.vue';
  import ToolsView from './views/ToolsView.vue';

  const active = ref<'chat' | 'todos' | 'tools' | 'settings'>('chat');
  const map = {
    chat: ChatView,
    todos: TodosView,
    tools: ToolsView,
    settings: SettingsView,
  } as const;
  const currentView = computed(() => map[active.value]);

  onMounted(() => {
    initTheme('light');
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
    background: var(--bg);
  }
  .app-main {
    flex: 1;
    min-height: 0;
  }
  .titlebar-spacer {
    height: var(--titlebar-inset);
    background: var(--bg);
    -webkit-app-region: drag;
  }
  :global(.platform-mac) .titlebar-spacer {
    border-bottom: 1px solid var(--border);
  }
</style>
