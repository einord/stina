<script setup lang="ts">
import Ai from './settings/Ai.vue'
import SettingsViewMenu, { type SettingsView } from './SettingsView.Menu.vue'
import { ref } from 'vue'

const currentView = ref<SettingsView>('ai')
</script>

<template>
  <div class="settings-view">
    <SettingsViewMenu v-model="currentView" />
    <div class="content">
      <Ai v-if="currentView === 'ai'" />
      <h1 v-else>Unknown page {{ currentView }}</h1>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: grid;
  grid-template-columns: auto 1fr;
  width: 100%;
  height: 100%;
}
</style>
