<script setup lang="ts">
  import { ref } from 'vue';

  import AISettings from '../components/settings/AISettings.vue';
  import AdvancedSettings from '../components/settings/AdvancedSettings.vue';
  import InterfaceSettings from '../components/settings/InterfaceSettings.vue';
  import ProfileSettings from '../components/settings/ProfileSettings.vue';
  import SettingsSidebar from '../components/settings/SettingsSidebar.vue';

  const activeGroup = ref('ai');
</script>

<template>
  <div class="settings-view">
    <SettingsSidebar v-model="activeGroup" />

    <div class="settings-content">
      <AISettings v-if="activeGroup === 'ai'" />
      <InterfaceSettings v-else-if="activeGroup === 'interface'" />
      <ProfileSettings v-else-if="activeGroup === 'profile'" />
      <AdvancedSettings v-else-if="activeGroup === 'advanced'" />
    </div>
  </div>
</template>

<style scoped>
  .settings-view {
    display: flex;
    height: 100%;
    overflow: hidden;
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    padding: 4em;
  }
</style>
