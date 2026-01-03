<script setup lang="ts">
import Ai from './settings/Ai.vue'
import Localization from './settings/Localization.vue'
import Interface from './settings/Interface.vue'
import Notifications from './settings/Notifications.vue'
import Profile from './settings/Profile.vue'
import Advanced from './settings/Advanced.vue'
import SettingsViewMenu, { type SettingsView } from './SettingsView.Menu.vue'
import { ref } from 'vue'

const currentView = ref<SettingsView>('ai')
</script>

<template>
  <div class="settings-view">
    <SettingsViewMenu v-model="currentView" />
    <div class="content">
      <Ai v-if="currentView === 'ai'" />
      <Localization v-else-if="currentView === 'localization'" />
      <Interface v-else-if="currentView === 'interface'" />
      <Notifications v-else-if="currentView === 'notifications'" />
      <Profile v-else-if="currentView === 'profile'" />
      <Advanced v-else-if="currentView === 'advanced'" />
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: grid;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: 100%;
  max-height: 100%;
  overflow-y: hidden;

  > .content {
    padding: var(--spacing-large);
    height: 100%;
    max-height: 100%;
    overflow-y: auto;
  }
}
</style>
