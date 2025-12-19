<script setup lang="ts">
  type buttonType = 'normal' | 'primary' | 'danger' | 'accent';

  withDefaults(
    defineProps<{
      type?: buttonType;
      title?: string;
      selected?: boolean;
      disabled?: boolean;
    }>(),
    {
      type: 'normal',
      disabled: false,
    },
  );
</script>

<template>
  <button
    class="simple-button"
    :class="[type, { selected }]"
    :title="title"
    :disabled="disabled"
    type="button"
  >
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
    border: 1px solid var(--border);
    border-radius: 1rem;
    display: grid;
    place-items: center;

    &:hover {
      background-color: var(--interactive-bg-hover);
    }

    &.danger {
      background-color: var(--danger, #e74c3c);
      color: white;
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

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
</style>
