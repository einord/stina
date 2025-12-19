<script setup lang="ts">
defineProps<{
  label: string
}>()
</script>

<template>
  <span class="app-badge">{{ label }}</span>
</template>

<style scoped>
.app-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
  background: var(--color-primary, #6366f1);
  color: var(--color-primary-text, #ffffff);
  border-radius: 9999px;
}
</style>
