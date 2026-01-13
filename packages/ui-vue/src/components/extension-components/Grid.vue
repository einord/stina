<script lang="ts" setup>
import type { GridProps } from '@stina/extension-api'
import ExtensionChildren from './ExtensionChildren.vue'
import { computed } from 'vue'

const props = defineProps<GridProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})

const gridTemplateColumns = computed(() => `repeat(${props.columns}, 1fr)`)
</script>

<template>
  <div class="grid">
    <ExtensionChildren :children="props.children" />
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: v-bind(gridTemplateColumns);
  gap: v-bind(gap);
}
</style>
