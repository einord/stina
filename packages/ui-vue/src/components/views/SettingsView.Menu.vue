<script setup lang="ts">
import TextNavigationButton from '../panels/NavigationButton.TextNavigationButton.vue'

export type SettingsView =
  | 'ai'
  | 'localization'
  | 'interface'
  | 'notifications'
  | 'profile'
  | 'advanced'

const value = defineModel<SettingsView>({ default: 'ai' })
</script>

<template>
  <aside class="settings-menu">
    <TextNavigationButton v-model="value" :value="'ai'" title="AI-konfiguration" />
    <TextNavigationButton v-model="value" :value="'localization'" title="Lokalisering" />
    <TextNavigationButton v-model="value" :value="'interface'" title="Gränssnitt" />
    <TextNavigationButton v-model="value" :value="'notifications'" title="Notiser" />
    <TextNavigationButton v-model="value" :value="'profile'" title="Profil" />
    <TextNavigationButton v-model="value" :value="'advanced'" title="Avancerat" />
  </aside>
</template>

<style scoped>
.settings-menu {
  background-color: var(--theme-main-components-navbar-sub-navbar-background);
  border-right: 1px solid var(--theme-general-border-color);
}
</style>
