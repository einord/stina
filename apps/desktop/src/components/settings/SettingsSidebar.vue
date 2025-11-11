<template>
  <aside class="sidebar">
    <nav>
      <button
        v-for="group in settingsGroups"
        :key="group.id"
        :class="{ active: activeGroup === group.id }"
        @click="$emit('select', group.id)"
        class="nav-item"
      >
        {{ group.label }}
      </button>
    </nav>
  </aside>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed } from 'vue';

  export interface SettingsGroup {
    id: string;
    label: string;
  }

  defineProps<{
    activeGroup: string;
  }>();

  defineEmits<{
    select: [groupId: string];
  }>();

  /**
   * Available settings groups that will be displayed in the sidebar.
   */
  const settingsGroups = computed<SettingsGroup[]>(() => [
    { id: 'ai', label: t('settings.groups.ai') },
    { id: 'interface', label: t('settings.groups.interface') },
    { id: 'profile', label: t('settings.groups.profile') },
    { id: 'advanced', label: t('settings.groups.advanced') },
  ]);
</script>

<style scoped>
  .sidebar {
    width: 200px;
    background: var(--bg-elev);
    border-right: 1px solid var(--border);
    padding: var(--space-4) 0;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .nav-item {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background 0.15s ease;
    font-size: var(--text-base);
    border-left: 3px solid transparent;
  }

  .nav-item:hover {
    background: var(--bg);
  }

  .nav-item.active {
    background: var(--bg);
    border-left-color: var(--accent);
    font-weight: 500;
  }
</style>
