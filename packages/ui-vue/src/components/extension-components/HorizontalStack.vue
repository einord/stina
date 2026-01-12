<script lang="ts" setup>
import type { HorizontalStackProps } from '@stina/extension-api'
import ExtensionComponent from './ExtensionComponent.vue'
import { computed } from 'vue'

const props = defineProps<HorizontalStackProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})
</script>

<template>
  <div class="horizontal-stack">
    <ExtensionComponent
      v-for="(child, index) in children"
      :key="index"
      :extension-component="child"
    />
  </div>
</template>

<style scoped>
.horizontal-stack {
  display: flex;
  flex-direction: row;
  gap: v-bind(gap);
}
</style>
