<script lang="ts" setup>
import type { VerticalStackProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import ExtensionChildren from './ExtensionChildren.vue'
import { computed } from 'vue'

const props = defineProps<VerticalStackProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <div class="vertical-stack" :style="rootStyle">
    <ExtensionChildren :children="props.children" />
  </div>
</template>

<style scoped>
.vertical-stack {
  display: flex;
  flex-direction: column;
  gap: v-bind(gap);
}
</style>
