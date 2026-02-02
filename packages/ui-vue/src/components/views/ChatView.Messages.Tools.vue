<script setup lang="ts">
import type { ToolCall } from '@stina/chat'
import ToolCallBadge from '../common/ToolCallBadge.vue'

defineProps<{
  tools: ToolCall[]
}>()
</script>

<template>
  <div class="tools">
    <ToolCallBadge
      v-for="(tool, index) in tools"
      :key="tool.name + '-' + index"
      :tool="tool"
    />
  </div>
</template>

<style scoped>
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem;
  justify-content: center;
  align-items: start;
}
</style>
