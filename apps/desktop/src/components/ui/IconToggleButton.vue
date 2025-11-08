<template>
  <button
    class="icon-toggle"
    type="button"
    :class="{ active }"
    :title="tooltip"
    :aria-label="tooltip"
    :aria-pressed="active ? 'true' : 'false'"
    @click="$emit('click')"
  >
    <component :is="icon" class="icon" />
  </button>
</template>

<script setup lang="ts">
  import type { Component } from 'vue';

  interface Props {
    icon: Component;
    tooltip: string;
    active?: boolean;
  }

  withDefaults(defineProps<Props>(), { active: false });
  defineEmits<{ (e: 'click'): void }>();
</script>

<style scoped>
  .icon-toggle {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-2);
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
    -webkit-app-region: no-drag;
  }
  .icon-toggle:hover {
    border-color: var(--border);
    background: var(--panel);
    color: var(--text);
  }
  .icon-toggle.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--bg-elev);
  }
  .icon {
    font-size: 16px;
    line-height: 1;
  }
</style>
