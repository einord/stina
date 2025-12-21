<script setup lang="ts">
import IconNavigationButton from './NavigationButton.IconNavigationButton.vue'

export type NavigationView = 'chat' | 'tools' | 'settings'

const value = defineModel<NavigationView>({ default: 'chat' })
</script>

<template>
  <aside class="main-navigation">
    <IconNavigationButton v-model="value" :value="'chat'" :title="$t('nav.chat')" icon="chat-01" />
    <IconNavigationButton
      v-model="value"
      :value="'tools'"
      :title="$t('nav.tools')"
      icon="wrench-01"
    />
    <IconNavigationButton
      v-model="value"
      :value="'settings'"
      :title="$t('nav.settings')"
      icon="settings-02"
    />
  </aside>
</template>

<style scoped>
.nav {
  display: flex;
  flex-direction: column;
}
</style>
