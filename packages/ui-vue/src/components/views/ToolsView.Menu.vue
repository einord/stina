<script setup lang="ts">
import TextNavigationButton from '../panels/NavigationButton.TextNavigationButton.vue'

export interface ToolsMenuItem {
  id: string
  title: string
}

const props = defineProps<{
  items: ToolsMenuItem[]
}>()

const value = defineModel<string | null>({ default: null })
</script>

<template>
  <aside class="tools-menu">
    <TextNavigationButton
      v-for="item in props.items"
      :key="item.id"
      v-model="value"
      :value="item.id"
      :title="item.title"
    />
  </aside>
</template>

<style scoped>
.tools-menu {
  background-color: var(--theme-main-components-navbar-sub-navbar-background);
  border-right: 1px solid var(--theme-general-border-color);
}
</style>
