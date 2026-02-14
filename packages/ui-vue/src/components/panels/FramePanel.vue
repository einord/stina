<script lang="ts" setup>
import type { StyleValue } from 'vue'
import type { FrameVariant } from '@stina/extension-api'
import { ref, computed } from 'vue'
import Icon from '../common/Icon.vue'

const props = withDefaults(defineProps<{
  style?: StyleValue,
  defaultExpanded?: boolean,
  variant: FrameVariant,
  collapsible?: boolean
}>(), {
  style: undefined,
  defaultExpanded: true,
  collapsible: false
})

const isExpanded = ref(props.defaultExpanded ?? true)
</script>

<template>
  <div class="extension-frame" :class="{ solid: props.variant === 'solid' }" :style="style">
    <button v-if="$slots['title'] && collapsible" type="button" class="frame-header clickable"
      :aria-expanded="isExpanded" @click="isExpanded = !isExpanded">
      <span class="frame-title">
        <slot name="title"></slot>
      </span>
      <Icon class="chevron" :class="{ expanded: isExpanded }" name="arrow-down-01" />
    </button>
    <div v-else-if="$slots['title']" class="frame-header">
      <span class="frame-title">
        <slot name="title"></slot>
      </span>
    </div>
    <div v-if="!props.collapsible || isExpanded" class="frame-content">
      <slot></slot>
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

    >.frame-header {
      border-bottom-color: var(--theme-general-border-color);
    }
  }

  >.frame-header {
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

    >.frame-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--theme-general-color);
      line-height: 1.4;
    }

    >.chevron {
      color: var(--theme-general-color-muted);
      font-size: 0.875rem;
      transition: transform 0.2s ease;
      flex-shrink: 0;

      &.expanded {
        transform: rotate(180deg);
      }
    }
  }

  >.frame-content {
    padding: 1rem;
  }
}
</style>
