<script lang="ts" setup>
import { computed } from 'vue'
import type { PillProps } from '@stina/extension-api'
import Icon from '../common/Icon.vue'

const props = defineProps<PillProps>()

const variant = computed(() => props.variant ?? 'default')
</script>

<template>
  <span class="extension-pill" :class="variant">
    <Icon v-if="props.icon" class="icon" :name="props.icon" />
    <span class="text">{{ props.text }}</span>
  </span>
</template>

<style scoped>
.extension-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;

  /* Default variant */
  background-color: var(--theme-components-pill-background);
  color: var(--theme-components-pill-color);

  &.primary {
    background-color: var(--theme-components-pill-background-primary);
    color: var(--theme-components-pill-color-primary);
  }

  &.success {
    background-color: var(--theme-components-pill-background-success);
    color: var(--theme-components-pill-color-success);
  }

  &.warning {
    background-color: var(--theme-components-pill-background-warning);
    color: var(--theme-components-pill-color-warning);
  }

  &.danger {
    background-color: var(--theme-components-pill-background-danger);
    color: var(--theme-components-pill-color-danger);
  }

  &.accent {
    background-color: var(--theme-components-pill-background-accent);
    color: var(--theme-components-pill-color-accent);
  }

  > .icon {
    font-size: 0.75rem;
    line-height: 1;
    flex-shrink: 0;
  }

  > .text {
    flex-shrink: 1;
    min-width: 0;
  }
}
</style>
