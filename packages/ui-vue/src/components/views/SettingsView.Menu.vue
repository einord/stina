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
    <TextNavigationButton v-model="value" :value="'ai'" :title="$t('settings.groups.ai')" />
    <TextNavigationButton
      v-model="value"
      :value="'localization'"
      :title="$t('settings.groups.localization')"
    />
    <TextNavigationButton
      v-model="value"
      :value="'interface'"
      :title="$t('settings.groups.interface')"
    />
    <TextNavigationButton
      v-model="value"
      :value="'settings'"
      :title="$t('settings.groups.settings')"
    />
    <TextNavigationButton
      v-model="value"
      :value="'profile'"
      :title="$t('settings.groups.profile')"
    />
    <TextNavigationButton
      v-model="value"
      :value="'advanced'"
      :title="$t('settings.groups.advanced')"
    />
  </aside>
</template>

<style scoped>
.settings-menu {
  background-color: var(--theme-main-components-navbar-sub-navbar-background);
  border-right: 1px solid var(--theme-general-border-color);
}
</style>
