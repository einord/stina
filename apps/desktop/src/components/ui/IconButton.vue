<template>
  <button class="btn" :aria-label="aria" @click="$emit('click')">
    <span class="icon" v-if="icon">{{ icon }}</span>
    <slot />
  </button>
</template>

<script setup lang="ts">
defineProps<{ icon?: string; aria?: string }>();
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--text);
  border-radius: var(--radius-2);
}
.btn:hover { filter: brightness(0.98); }
.icon { font-size: 14px; line-height: 1; }
</style>