<script setup lang="ts">
import IconNavigationButton from './NavigationButton.IconNavigationButton.vue'

type alternatives = 'chat' | 'tools' | 'settings'

const value = defineModel<alternatives>()
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
