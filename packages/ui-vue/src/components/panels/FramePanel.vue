<script lang="ts" setup>
import type { StyleValue } from 'vue'
import type { FrameVariant, HugeIconName } from '@stina/extension-api'
import { computed, ref, useSlots } from 'vue'
import Icon from '../common/Icon.vue'

const slots = useSlots()

const props = withDefaults(defineProps<{
  style?: StyleValue,
  defaultExpanded?: boolean,
  variant: FrameVariant,
  collapsible?: boolean,
  icon?: HugeIconName
}>(), {
  style: undefined,
  defaultExpanded: true,
  collapsible: false
})

const isExpanded = ref(props.defaultExpanded ?? true)
const hasTitle = computed(() => slots['title'] != null)
const hasHeader = computed(() => props.icon != null || hasTitle.value || props.collapsible === true)
</script>

<template>
  <div class="extension-frame" :class="{ solid: props.variant === 'solid' }" :style="style">
    <template v-if="hasHeader">
      <button v-if="hasTitle && collapsible" type="button" class="frame-header clickable" :aria-expanded="isExpanded"
        @click="isExpanded = !isExpanded">
        <Icon v-if="icon" class="frame-icon" :name="icon" />
        <span v-if="hasTitle" class="frame-title">
          <slot name="title"></slot>
        </span>
        <Icon v-if="collapsible === true" class="chevron" :class="{ expanded: isExpanded }" name="arrow-down-01" />
      </button>
      <div v-else class="frame-header">
        <Icon v-if="icon" class="frame-icon" :name="icon" />
        <span v-if="hasTitle" class="frame-title">
          <slot name="title"></slot>
        </span>
      </div>
    </template>
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
    background: var(--theme-general-background-panel);
  }

  >.frame-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: none;
    border: none;
    width: 100%;
    text-align: left;
    color: var(--theme-general-color);

    &.clickable {
      cursor: pointer;
      transition: background-color 0.15s ease;

      &:hover {
        background: var(--theme-general-background-hover);
      }
    }

    >.icon {
      width: 1em;
      height: 1em;
    }

    >.frame-title {
      font-size: 1rem;
      font-weight: var(--font-weight-bold);
      color: var(--theme-general-color);
      line-height: 1.4;
      flex: 1 1;
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

  >.frame-header + .frame-content {
    border-top: 1px solid var(--theme-general-border-color);
  }

  >.frame-content {
    padding: 1rem;
  }
}
</style>
