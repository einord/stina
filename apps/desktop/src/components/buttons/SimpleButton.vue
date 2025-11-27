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
  <button class="simple-button pop-out" :class="[type, { selected }]" :title="title">
    <slot></slot>
  </button>
</template>

<style scoped>
  .simple-button {
    padding: 0.75em 1em;
    background: var(--interactive-bg);
    cursor: pointer;
    font-size: 1rem;
    color: var(--text);
    transition: background 0.15s ease;

    &:hover {
      background-color: var(--primary-hover);
    }

    &.danger {
      color: var(--danger, #e74c3c);
    }

    &.primary {
      background-color: var(--primary);
      color: white;
      border: none;
    }
  }
</style>
