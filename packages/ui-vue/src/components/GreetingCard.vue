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
  padding: var(--spacing, 1rem);
  background: var(--color-muted, #f3f4f6);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius, 0.5rem);

  > .greeting-message {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-foreground, #1a1a2e);
  }

  > .greeting-timestamp {
    display: block;
    font-size: 0.875rem;
    color: var(--color-muted-text, #6b7280);
  }
}
</style>
