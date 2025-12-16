<script setup lang="ts">
  import { computed, type Component } from 'vue';
  import {
    resolveQuickCommandIcon
} from '../../lib/quickCommandIcons';

  interface Props {
    icon?: string;
    iconComponent?: Component;
    aria?: string;
    type?: 'button' | 'submit' | 'reset' | 'danger';
    disabled?: boolean;
  }

  const props = withDefaults(defineProps<Props>(), { type: 'button' });

  const selectedIconComponent = computed(() => props.icon == null ? undefined : resolveQuickCommandIcon(props.icon));
</script>

<template>
  <button
    class="btn"
    :class="type"
    :aria-label="aria"
    :type="type == 'danger' ? 'button' : type"
    :disabled="disabled"
    @click="() => disabled || $emit('click')"
  >
    <component v-if="props.icon != null" :is="selectedIconComponent" class="icon" />
    <component v-else-if="props.iconComponent" :is="props.iconComponent" class="icon" />
    <span class="icon-text" v-else-if="props.icon">{{ props.icon }}</span>
    <slot />
  </button>
</template>

<style scoped>
  .btn {
    width: 28px;
    height: 28px;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background 0.2s ease,
      color 0.2s ease;
    -webkit-app-region: no-drag;

    &:hover {
      border-color: var(--border);
      background: var(--selected-bg);
      color: var(--text);
    }

    &.active {
      border-color: var(--accent);
      color: var(--accent);
    }

    &.danger {
      &:hover {
        background-color: var(--danger, #e74c3c);
        color: white;
      }
    }

    &[disabled] {
      cursor: default;

      &:hover {
        border-color: transparent;
        background: transparent;
        color: var(--muted);
      }
    }

    > .icon {
      font-size: 16px;
      line-height: 1;
    }
  }
</style>
