<script setup lang="ts">
import AiModels from './Ai.Models.vue'
import AiQuickCommands from './Ai.QuickCommands.vue'
import AiPersonalities from './Ai.Personalities.vue'
</script>

<template>
  <div class="ai-settings">
    <AiModels />
    <AiPersonalities />
    <AiQuickCommands />
  </div>
</template>

<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
</style>
