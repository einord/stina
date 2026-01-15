<script lang="ts" setup>
import type { HorizontalStackProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import ExtensionChildren from './ExtensionChildren.vue'
import { computed } from 'vue'

const props = defineProps<HorizontalStackProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <div class="horizontal-stack" :style="rootStyle">
    <ExtensionChildren :children="props.children" />
  </div>
</template>

<style scoped>
.horizontal-stack {
  display: flex;
  flex-direction: row;
  gap: v-bind(gap);
}
</style>
