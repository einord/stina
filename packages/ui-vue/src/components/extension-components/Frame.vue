<script lang="ts" setup>
import type { FrameProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { ref, computed } from 'vue'
import Icon from '../common/Icon.vue'
import ExtensionChildren from './ExtensionChildren.vue'

const props = defineProps<FrameProps>()

const rootStyle = computed(() => props.style as StyleValue)

const isExpanded = ref(props.defaultExpanded ?? true)
</script>

<template>
  <div class="extension-frame" :class="{ solid: props.variant === 'solid' }" :style="rootStyle">
    <button
      v-if="props.title && props.collapsible"
      type="button"
      class="frame-header clickable"
      :aria-expanded="isExpanded"
      @click="isExpanded = !isExpanded"
    >
      <span class="frame-title">{{ props.title }}</span>
      <Icon class="chevron" :class="{ expanded: isExpanded }" name="arrow-down-01" />
    </button>
    <div v-else-if="props.title" class="frame-header">
      <span class="frame-title">{{ props.title }}</span>
    </div>
    <div v-if="!props.collapsible || isExpanded" class="frame-content">
      <ExtensionChildren :children="props.children" />
    </div>
  </div>
</template>

<style scoped>
.extension-frame {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-general-border-color);
  border-radius: var(--border-radius-normal, 1rem);
  overflow: hidden;

  &.solid {
    border: none;
    background: var(--theme-general-background-secondary);

    > .frame-header {
      border-bottom-color: var(--theme-general-border-color);
    }
  }

  > .frame-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--theme-general-border-color);
    width: 100%;
    text-align: left;

    &.clickable {
      cursor: pointer;
      transition: background-color 0.15s ease;

      &:hover {
        background: var(--theme-general-background-hover);
      }
    }

    > .frame-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--theme-general-color);
      line-height: 1.4;
    }

    > .chevron {
      color: var(--theme-general-color-muted);
      font-size: 0.875rem;
      transition: transform 0.2s ease;
      flex-shrink: 0;

      &.expanded {
        transform: rotate(180deg);
      }
    }
  }

  > .frame-content {
    padding: 1rem;
  }
}
</style>
