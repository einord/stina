<script lang="ts" setup>
import type { VerticalStackProps } from '@stina/extension-api'
import ExtensionComponent from './ExtensionComponent.vue'
import { computed } from 'vue'

const props = defineProps<VerticalStackProps>()

const gap = computed(() => {
  return typeof props.gap === 'number' ? `${props.gap}rem` : props.gap || '0px'
})
</script>

<template>
  <div class="vertical-stack">
    <ExtensionComponent
      v-for="(child, index) in children"
      :key="index"
      :extension-component="child"
    />
  </div>
</template>

<style scoped>
.vertical-stack {
  display: flex;
  flex-direction: column;
  gap: v-bind(gap);
}
</style>
