<script setup lang="ts" generic="T">
import NavigationButton from './NavigationButton.vue'

defineProps<{
  icon: string
  value?: T
  title?: string
}>()

const currentActive = defineModel<T>()
</script>

<template>
  <NavigationButton v-model="currentActive" class="nav-button" :value="value" :title="title">
    <Icon :name="icon" class="icon" />
  </NavigationButton>
</template>

<style scoped>
.nav-button {
  text-align: center;
  color: var(--theme-main-components-navbar-foreground);
  width: auto;
  height: auto;
  display: grid;
  place-items: center;
  padding: var(--spacing-normal);

  > .icon {
    font-size: 1.25rem;
  }
}
</style>
