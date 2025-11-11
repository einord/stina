<template>
  <div class="settings-view">
    <SettingsSidebar :active-group="activeGroup" @select="activeGroup = $event" />

    <div class="settings-content">
      <AISettings v-if="activeGroup === 'ai'" />
      <InterfaceSettings v-else-if="activeGroup === 'interface'" />
      <AdvancedSettings v-else-if="activeGroup === 'advanced'" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';

  import AISettings from '../components/settings/AISettings.vue';
  import AdvancedSettings from '../components/settings/AdvancedSettings.vue';
  import InterfaceSettings from '../components/settings/InterfaceSettings.vue';
  import SettingsSidebar from '../components/settings/SettingsSidebar.vue';

  const activeGroup = ref('ai');
</script>

<style scoped>
  .settings-view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
  }
</style>
