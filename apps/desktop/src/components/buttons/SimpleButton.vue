<script setup lang="ts">
  type buttonType = 'normal' | 'primary' | 'danger';

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
    padding: var(--space-2) var(--space-3);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-2);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text);
    transition: background 0.15s ease;

    &:hover {
      background-color: var(--primary-hover);
    }

    &:active {
      background-color: var(--primary-active);
    }

    &.danger {
      color: var(--danger, #e74c3c);
    }

    &.primary {
      background-color: var(--primary);
      color: white;
      border: none;
    }

    &.selected {
      outline: 2px solid var(--primary);
    }
  }
</style>
