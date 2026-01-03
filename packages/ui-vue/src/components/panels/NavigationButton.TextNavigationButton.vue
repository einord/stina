<script setup lang="ts" generic="T">
import NavigationButton from './NavigationButton.vue'

defineProps<{
  value?: T
  title?: string
}>()

const currentActive = defineModel<T>()
</script>

<template>
  <NavigationButton v-model="currentActive" class="nav-button" :value="value" :title="title">
    {{ title }}
  </NavigationButton>
</template>

<style scoped>
.nav-button {
  color: var(--theme-main-components-navbar-foreground);
  width: 100%;
  height: auto;
  display: grid;
  place-items: center left;
  padding: var(--spacing-normal);
}
</style>
