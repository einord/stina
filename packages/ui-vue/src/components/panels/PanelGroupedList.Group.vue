<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../common/Icon.vue'
import PanelGroupedListItem from './PanelGroupedList.Item.vue'
import { usePanelGroupedListContext } from './panelGroupedList.Context.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'

const props = defineProps<{
  group: PanelGroupedListRecord
}>()

const state = usePanelGroupedListContext()
const view = state.view
const groupTitle = computed(() => state.getGroupTitle(props.group))
const groupItems = computed(() => state.getGroupItems(props.group))
const isCollapsed = computed(() => state.isGroupCollapsed(props.group))
const canToggle = computed(() => Boolean(state.view.value.group.collapsedKey))
</script>

<template>
  <section class="group">
    <button
      class="group-header"
      type="button"
      :disabled="!canToggle"
      @click="state.toggleGroup(group)"
    >
      <Icon v-if="canToggle" class="chevron" name="chevron-right" :class="{ open: !isCollapsed }" />
      <span class="title">{{ groupTitle }}</span>
      <span class="count">{{ groupItems.length }}</span>
    </button>
    <div v-if="!isCollapsed" class="group-body">
      <div v-if="groupItems.length === 0" class="group-empty">
        {{ view.group.emptyLabel ?? 'No items' }}
      </div>
      <div v-else class="items">
        <PanelGroupedListItem
          v-for="item in groupItems"
          :key="state.getItemKey(group, item)"
          :group="group"
          :item="item"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  > .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    color: var(--theme-general-color);

    &:disabled {
      cursor: default;
      opacity: 0.7;
    }

    > .chevron {
      transition: transform 0.2s ease;

      &.open {
        transform: rotate(90deg);
      }
    }

    > .title {
      font-weight: var(--font-weight-medium);
    }

    > .count {
      margin-left: auto;
      font-size: 0.8rem;
      color: var(--theme-general-muted, #6b7280);
    }
  }

  > .group-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-left: 1.25rem;

    > .group-empty {
      color: var(--theme-general-muted, #6b7280);
      font-size: 0.8rem;
    }

    > .items {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  }
}
</style>
