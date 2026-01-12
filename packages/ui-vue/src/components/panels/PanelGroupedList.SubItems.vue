<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../common/Icon.vue'
import { usePanelGroupedListContext } from './panelGroupedList.Context.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'

const props = defineProps<{
  group: PanelGroupedListRecord
  item: PanelGroupedListRecord
}>()

const state = usePanelGroupedListContext()
const config = computed(() => state.view.value.item.subItems)
const subItems = computed(() => state.getSubItems(props.item))
const itemKey = computed(() => state.getItemKey(props.group, props.item))
const canAdd = computed(() => Boolean(config.value?.actions?.add))
const canDelete = computed(() => Boolean(config.value?.actions?.delete))
</script>

<template>
  <div class="subitems">
    <div v-if="canAdd" class="subitem-add">
      <input
        class="subitem-input"
        type="text"
        :placeholder="config?.inputPlaceholder ?? 'Add step'"
        :value="state.getSubItemDraft(group, item)"
        @input="
          (event) => state.setSubItemDraft(group, item, (event.target as HTMLInputElement).value)
        "
      />
      <button
        class="subitem-add-button"
        type="button"
        :disabled="state.isActionBusy(`subitem-add:${itemKey}`)"
        @click="state.onAddSubItem(group, item)"
      >
        Add
      </button>
    </div>
    <div
      v-for="subItem in subItems"
      :key="state.getSubItemId(subItem) || state.getSubItemText(subItem)"
      class="subitem"
    >
      <button
        class="subitem-toggle"
        type="button"
        @click="state.onToggleSubItem(group, item, subItem)"
      >
        <Icon
          class="subitem-icon"
          :name="state.isSubItemCompleted(subItem) ? 'check-circle' : 'circle'"
        />
      </button>
      <span :class="{ done: state.isSubItemCompleted(subItem) }">
        {{ state.getSubItemText(subItem) }}
      </span>
      <button
        v-if="canDelete"
        class="subitem-delete"
        type="button"
        :disabled="state.isActionBusy(`subitem-delete:${itemKey}:${state.getSubItemId(subItem)}`)"
        @click="state.onDeleteSubItem(group, item, subItem)"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.subitems {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  > .subitem-add {
    display: flex;
    align-items: center;
    gap: 0.4rem;

    > .subitem-input {
      flex: 1;
      border: 1px solid var(--theme-general-border-color);
      border-radius: var(--border-radius-normal);
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
      background: var(--theme-main-components-main-background);
      color: var(--theme-general-color);
    }

    > .subitem-add-button {
      border: 1px solid var(--theme-general-border-color);
      background: transparent;
      color: var(--theme-general-color);
      padding: 0.35rem 0.6rem;
      border-radius: var(--border-radius-normal);
      font-size: 0.75rem;
      cursor: pointer;

      &:hover {
        background: var(--theme-general-border-color);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
    }
  }

  > .subitem {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--theme-general-color);

    > .subitem-toggle {
      border: none;
      background: transparent;
      padding: 0;
      cursor: pointer;

      > .subitem-icon {
        font-size: 0.9rem;
      }
    }

    > .done {
      text-decoration: line-through;
      color: var(--theme-general-muted, #6b7280);
    }

    > .subitem-delete {
      margin-left: auto;
      border: none;
      background: transparent;
      color: var(--theme-general-muted, #6b7280);
      font-size: 0.7rem;
      cursor: pointer;

      &:hover {
        color: var(--theme-general-color);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
    }
  }
}
</style>
