<template>
  <button class="btn" :aria-label="aria" :type="type" @click="$emit('click')">
    <component v-if="iconComponent" :is="iconComponent" class="icon" />
    <span class="icon-text" v-else-if="icon">{{ icon }}</span>
    <slot />
  </button>
</template>

<script setup lang="ts">
  import type { Component } from 'vue';

  interface Props {
    icon?: string;
    iconComponent?: Component;
    aria?: string;
    type?: 'button' | 'submit' | 'reset';
  }

  withDefaults(defineProps<Props>(), { type: 'button' });
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
  .btn:hover {
    filter: brightness(0.98);
  }
  .icon {
    font-size: 16px;
    line-height: 1;
  }
  .icon-text {
    font-size: 14px;
    line-height: 1;
  }
</style>
