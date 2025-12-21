<script setup lang="ts">
import IconNavigationButton from './NavigationButton.IconNavigationButton.vue'
import { useI18n } from '../../composables/useI18n.js'

type alternatives = 'chat' | 'tools' | 'settings'

const value = defineModel<alternatives>()
const { t } = useI18n()
</script>

<template>
  <aside class="main-navigation">
    <IconNavigationButton v-model="value" :value="'chat'" :title="t('nav.chat')"
      >C</IconNavigationButton
    >
    <IconNavigationButton v-model="value" :value="'tools'" :title="t('nav.tools')"
      >T</IconNavigationButton
    >
    <IconNavigationButton v-model="value" :value="'settings'" :title="t('nav.settings')"
      >S</IconNavigationButton
    >
  </aside>
</template>

<style scoped>
.nav {
  display: flex;
  flex-direction: column;
}
</style>
