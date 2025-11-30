<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed } from 'vue';

  import NavButtonText from '../nav/NavButtonText.vue';

  export interface SettingsGroup {
    id: string;
    label: string;
  }

  const activeGroup = defineModel<string>();

  /**
   * Available settings groups that will be displayed in the sidebar.
   */
  const settingsGroups = computed<SettingsGroup[]>(() => [
    { id: 'ai', label: t('settings.groups.ai') },
    { id: 'interface', label: t('settings.groups.interface') },
    { id: 'profile', label: t('settings.groups.profile') },
    { id: 'work', label: t('settings.groups.work') },
    { id: 'advanced', label: t('settings.groups.advanced') },
  ]);
</script>

<template>
  <nav class="sidebar">
    <NavButtonText
      v-for="group in settingsGroups"
      :key="group.id"
      v-model="activeGroup"
      :value="group.id"
      :title="group.label"
    >
      {{ group.label }}
    </NavButtonText>
  </nav>
</template>

<style scoped>
  .sidebar {
    width: 200px;
    background: var(--window-bg-lower);
    padding-top: 1rem;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
</style>
