<script setup lang="ts" generic="T">
  defineProps<{
    value?: T;
    title?: string;
  }>();

  const currentActive = defineModel<T>();
</script>

<template>
  <button
    class="nav-button"
    :class="{ active: currentActive === value }"
    @click="() => (currentActive = value)"
    :title="title"
  >
    <slot></slot>
  </button>
</template>

<style scoped>
  .nav-button {
    width: 50px;
    height: 50px;
    border: none;
    border-right: 2px solid transparent;
    background: var(--panel);
    color: var(--text);
    padding-right: 2px;
    font-size: var(--text-base);

    &.active {
      border-right: 2px solid var(--primary);
    }
    &:has(> svg) {
      font-size: 18px;
    }
  }
</style>
