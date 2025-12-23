<script setup lang="ts">
import MarkDown from '../common/MarkDown.vue'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="instruction">
    <MarkDown class="content" :content="message" />
  </div>
</template>

<style scoped>
.instruction {
  border: 1px solid var(--secondary);
  padding: 1rem 2rem;
  background-color: hsla(0, 0%, 100%, 0.05);

  > .header {
    font-weight: 800;
    margin-bottom: 1rem;
    text-align: center;
  }

  > .content {
    font-family: monospace;
  }
}
</style>
