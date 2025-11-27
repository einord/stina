<script setup lang="ts">
  type buttonType = 'normal' | 'primary' | 'danger' | 'accent';

  withDefaults(
    defineProps<{
      type?: buttonType;
      title?: string;
      selected?: boolean;
    }>(),
    {
      type: 'normal',
    },
  );
</script>

<template>
  <button class="simple-button" :class="[type, { selected }]" :title="title">
    <slot></slot>
  </button>
</template>

<style scoped>
  .simple-button {
    padding: 1em 2em;
    background: var(--interactive-bg);
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text);
    transition: background 0.15s ease;
    border: 1px solid var(--border);
    border-radius: 0.25rem;

    &:hover {
      background-color: var(--interactive-bg-hover);
    }

    &.danger {
      color: var(--danger, #e74c3c);
    }

    &.primary {
      background-color: var(--primary);
      color: white;
      border: none;
    }

    &.accent {
      background-color: var(--accent);
      color: var(--accent-fg);
      border: none;
    }
  }
</style>
