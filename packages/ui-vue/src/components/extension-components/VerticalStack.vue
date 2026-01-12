<script lang="ts" setup>
import type { VerticalStackProps } from '@stina/extension-api'
import ExtensionChildren from './ExtensionChildren.vue'
import { computed } from 'vue'

const props = defineProps<VerticalStackProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})
</script>

<template>
  <div class="vertical-stack">
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
