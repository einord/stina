<script setup lang="ts">
import { computed } from 'vue'
import TextNavigationButton from '../panels/NavigationButton.TextNavigationButton.vue'
import { useAuth } from '../../composables/useAuth.js'

export type SettingsView =
  | 'ai'
  | 'extensions'
  | 'localization'
  | 'interface'
  | 'notifications'
  | 'profile'
  | 'advanced'
  | 'administration'

const value = defineModel<SettingsView>({ default: 'ai' })

const auth = useAuth()
const isAdmin = computed(() => auth.user.value?.role === 'admin')
</script>

<template>
  <aside class="settings-menu">
    <TextNavigationButton v-model="value" :value="'ai'" title="AI-konfiguration" />
    <TextNavigationButton v-model="value" :value="'extensions'" :title="$t('extensions.title')" />
    <TextNavigationButton v-model="value" :value="'localization'" title="Lokalisering" />
    <TextNavigationButton v-model="value" :value="'interface'" title="Gränssnitt" />
    <TextNavigationButton v-model="value" :value="'notifications'" title="Notiser" />
    <TextNavigationButton v-model="value" :value="'profile'" title="Profil" />
    <TextNavigationButton v-model="value" :value="'advanced'" title="Avancerat" />
    <TextNavigationButton
      v-if="isAdmin"
      v-model="value"
      :value="'administration'"
      title="Administration"
    />
  </aside>
</template>

<style scoped>
.settings-menu {
  background-color: var(--theme-main-components-navbar-sub-navbar-background);
  border-right: 1px solid var(--theme-general-border-color);
}
</style>
