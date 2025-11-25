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
    min-width: 50px;
    width: 100%;
    height: 50px;
    border: none;
    border-right: 2px solid transparent;
    color: var(--text);
    padding-right: 2px;
    font-size: var(--text-base);
    padding: 1rem;
    background-color: transparent;

    &.active {
      /* border-right: 2px solid var(--primary); */
      background-color: var(--selected-bg);
    }
    &:has(> svg) {
      font-size: 18px;
    }
  }
</style>
