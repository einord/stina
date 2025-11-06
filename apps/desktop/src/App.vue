<template>
  <MainLayout v-model:value="active">
    <template #default>
      <component :is="currentView" />
    </template>
  </MainLayout>
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
  .layout {
    height: 100%;
  }
</style>
