<template>
  <div class="layout" :class="{ 'has-todo-panel': todoPanelVisible }">
    <SideNav v-model:value="active" />
    <section class="content">
      <slot :active="active" />
    </section>
    <aside v-if="todoPanelVisible" class="todo-panel">
      <slot name="todo-panel" />
    </aside>
  </div>
</template>

<script setup lang="ts">
  import SideNav from '../nav/SideNav.vue';

  defineProps<{ todoPanelVisible?: boolean }>();
  const active = defineModel<'chat' | 'tools' | 'settings'>('value', { default: 'chat' });
</script>

<style scoped>
  .layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    --todo-panel-width: 320px;
  }
  .layout.has-todo-panel {
    grid-template-columns: auto minmax(0, 1fr) var(--todo-panel-width);
  }
  .content {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: grid;
  }
  .todo-panel {
    border-left: 1px solid var(--border);
    background: var(--bg-elev);
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
</style>
