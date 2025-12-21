<script setup lang="ts">
import IconNavigationButton from './NavigationButton.IconNavigationButton.vue'

type alternatives = 'chat' | 'tools' | 'settings'

const value = defineModel<alternatives>()
</script>

<template>
  <aside class="main-navigation">
    <IconNavigationButton v-model="value" :value="'chat'" :title="$t('nav.chat')"
      ><Icon name="chat-01" class="icon"
    /></IconNavigationButton>
    <IconNavigationButton v-model="value" :value="'tools'" :title="$t('nav.tools')"
      >T</IconNavigationButton
    >
    <IconNavigationButton v-model="value" :value="'settings'" :title="$t('nav.settings')"
      >S</IconNavigationButton
    >
  </aside>
</template>

<style scoped>
.nav {
  display: flex;
  flex-direction: column;

  .icon {
    width: 1rem;
    height: 1rem;
  }
}
</style>
