<script setup lang="ts">
import Icon from '../common/Icon.vue'

defineProps<{
  toolUsages: string[]
}>()
</script>

<template>
  <div class="tools">
    <div v-for="toolUsage in toolUsages" :key="toolUsage" class="tool">
      <Icon name="wrench-01" />
      {{ toolUsage }}
    </div>
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

  > .tool {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.5em;
    border: 1px solid var(--theme-main-components-chat-tool-color);
    border-radius: 0.75rem;
    padding: 0.5rem;
    background: var(--theme-main-components-chat-tool-background);
    cursor: pointer;
    color: var(--theme-main-components-chat-tool-color);
    text-align: left;
    font-size: 0.75rem;
    font-weight: bold;
  }
}
</style>
