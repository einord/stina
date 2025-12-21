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
    <slot></slot>
  </NavigationButton>
</template>

<style scoped>
.nav-button {
  text-align: left;
}
</style>
