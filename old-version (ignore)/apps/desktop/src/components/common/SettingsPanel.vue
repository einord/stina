<script setup lang="ts">
  /**
   * Generic container for settings sections with consistent padding, border, and background.
   */
  defineProps<{
    tone?: 'default' | 'danger';
  }>();
</script>

<template>
  <section class="settings-panel" :class="tone">
    <slot />
  </section>
</template>

<style scoped>
  .settings-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .settings-panel.danger {
    background: var(--bg-elev);
    border-color: var(--border);
  }

  :deep(> p) {
    color: var(--muted);
  }
</style>
