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
    { id: 'advanced', label: t('settings.groups.advanced') },
  ]);
</script>

<template>
  <aside class="sidebar">
    <nav>
      <NavButtonText
        v-for="group in settingsGroups"
        :key="group.id"
        v-model="activeGroup"
        :value="group.id"
        :title="t('nav.chat')"
      >
        {{ group.label }}
      </NavButtonText>
    </nav>
  </aside>
</template>

<style scoped>
  .sidebar {
    width: 200px;
    background: var(--bg-elev);
    border-right: 1px solid var(--border);
  }

  nav {
    display: flex;
    flex-direction: column;
  }
</style>
