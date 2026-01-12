<script lang="ts" setup>
import type { GridProps } from '@stina/extension-api'
import ExtensionComponent from './ExtensionComponent.vue'
import { computed } from 'vue'

const props = defineProps<GridProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})

const gridTemplateColumns = computed(() => `repeat(${props.columns}, 1fr)`)
</script>

<template>
  <div class="grid">
    <ExtensionComponent
      v-for="(child, index) in children"
      :key="index"
      :extension-component="child"
    />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: v-bind(gridTemplateColumns);
  gap: v-bind(gap);
}
</style>
