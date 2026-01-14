<script lang="ts" setup>
import { ref } from 'vue'
import type { CollapsibleProps } from '@stina/extension-api'
import Icon from '../common/Icon.vue'
import ExtensionComponent from './ExtensionComponent.vue'

const props = defineProps<CollapsibleProps>()

const isExpanded = ref(props.defaultExpanded ?? false)
// Generate a unique ID once during component initialization using crypto API if available
const contentId = typeof crypto !== 'undefined' && crypto.randomUUID
  ? `collapsible-${crypto.randomUUID()}`
  : `collapsible-content-${Math.random().toString(36).substring(2, 11)}`

function toggle() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <section class="extension-collapsible">
    <button
      type="button"
      class="collapsible-header"
      :aria-expanded="isExpanded"
      :aria-controls="contentId"
      @click="toggle"
    >
      <div class="header-main">
        <div class="title-row">
          <Icon v-if="props.icon" class="icon" :name="props.icon" />
          <span class="title">{{ props.title }}</span>
        </div>
        <div v-if="props.description" class="description">
          <template v-if="Array.isArray(props.description)">
            <p v-for="(line, index) in props.description" :key="index">
              {{ line }}
            </p>
          </template>
          <p v-else>{{ props.description }}</p>
        </div>
      </div>
      <Icon class="chevron" :class="{ expanded: isExpanded }" name="arrow-down-01" />
    </button>
    <div
      v-if="isExpanded && props.content"
      :id="contentId"
      role="region"
      class="collapsible-content"
    >
      <ExtensionComponent :extension-component="props.content" />
    </div>
  </section>
</template>

<style scoped>
.extension-collapsible {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--theme-components-collapsible-border-color);
  border-radius: 0.5rem;
  overflow: hidden;
}

.collapsible-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--theme-components-collapsible-header-background);
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--theme-components-collapsible-header-background-hover);
  }

  > .header-main {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;

    > .title-row {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;

      > .icon {
        color: var(--theme-components-collapsible-icon-color);
        font-size: 1.125rem;
        line-height: 1;
      }

      > .title {
        color: var(--theme-components-collapsible-title-color);
        font-size: 1rem;
        font-weight: 500;
        line-height: 1.4;
      }
    }

    > .description {
      color: var(--theme-components-collapsible-description-color);
      font-size: 0.875rem;
      line-height: 1.4;

      > p {
        margin: 0;
      }
    }
  }

  > .chevron {
    color: var(--theme-components-collapsible-icon-color);
    font-size: 1rem;
    transition: transform 0.2s ease;
    flex-shrink: 0;

    &.expanded {
      transform: rotate(180deg);
    }
  }
}

.collapsible-content {
  padding: 1rem;
  background: var(--theme-components-collapsible-content-background);
  border-top: 1px solid var(--theme-components-collapsible-border-color);
}
</style>
