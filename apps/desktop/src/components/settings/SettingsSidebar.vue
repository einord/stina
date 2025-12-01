<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed } from 'vue';

  import SubNav from '../nav/SubNav.vue';

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
    { id: 'notifications', label: t('settings.groups.notifications') },
    { id: 'profile', label: t('settings.groups.profile') },
    { id: 'work', label: t('settings.groups.work') },
    { id: 'advanced', label: t('settings.groups.advanced') },
  ]);
</script>

<template>
  <SubNav v-model="activeGroup" :items="settingsGroups" :aria-label="t('settings.title')" />
</template>

<style scoped>
</style>
