<script setup lang="ts">
import type { Greeting } from '@stina/shared'

defineProps<{
  greeting: Greeting
}>()
</script>

<template>
  <div class="greeting-card">
    <p class="greeting-message">{{ greeting.message }}</p>
    <time class="greeting-timestamp">{{ greeting.timestamp }}</time>
  </div>
</template>

<style scoped>
.greeting-card {
  padding: var(--theme-layout-spacing, 1rem);
  background: var(--theme-surface-muted, #2d2d44);
  border: 1px solid var(--theme-surface-border, #3d3d5c);
  border-radius: var(--theme-layout-radius, 0.5rem);

  > .greeting-message {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-main-window-foreground, #eaeaea);
  }

  > .greeting-timestamp {
    display: block;
    font-size: 0.875rem;
    color: var(--theme-surface-muted-text, #9ca3af);
  }
}
</style>
