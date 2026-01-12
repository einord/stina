<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../common/Icon.vue'
import PanelGroupedListSubItems from './PanelGroupedListSubItems.vue'
import PanelGroupedListComments from './PanelGroupedListComments.vue'
import { usePanelGroupedListContext } from './panelGroupedListContext.js'
import type { PanelGroupedListRecord } from './panelGroupedListTypes.js'

const props = defineProps<{
  group: PanelGroupedListRecord
  item: PanelGroupedListRecord
}>()

const state = usePanelGroupedListContext()

const itemKey = computed(() => state.getItemKey(props.group, props.item))
const hasDetails = computed(() => state.hasItemDetails(props.item))
const isExpanded = computed(() => state.expandedItems.value.has(itemKey.value))
const title = computed(() => state.getItemTitle(props.item))
const description = computed(() => state.getItemDescription(props.item))
const icon = computed(() => state.getItemIcon(props.item))
const status = computed(() => state.getItemStatus(props.item))
const date = computed(() => state.getItemDate(props.item))
const time = computed(() => state.getItemTime(props.item))
const commentCount = computed(() => state.getItemCommentCount(props.item))
const showSubItems = computed(
  () =>
    state.getSubItems(props.item).length > 0 ||
    Boolean(state.view.value.item.subItems?.actions?.add)
)
const showComments = computed(
  () =>
    state.getItemComments(props.item).length > 0 ||
    Boolean(state.view.value.item.comments?.actions?.add)
)
const showEdit = computed(
  () => Boolean(state.view.value.editor || state.view.value.actions?.editItem)
)

const toggleExpanded = () => {
  if (!hasDetails.value) return
  state.toggleItemExpanded(itemKey.value)
}
</script>

<template>
  <article class="item">
    <button class="item-row" type="button" @click="toggleExpanded">
      <Icon v-if="icon" class="item-icon" :name="icon" />
      <div class="item-main">
        <div class="item-title">
          <span>{{ title }}</span>
          <span v-if="status" class="status">{{ status }}</span>
        </div>
        <div class="item-meta">
          <span v-if="date || time" class="datetime">{{ date }} {{ time }}</span>
          <span v-if="commentCount !== null" class="comments">
            <Icon class="comment-icon" name="chat-bubble" />
            {{ commentCount }}
          </span>
        </div>
      </div>
      <Icon
        v-if="hasDetails"
        class="expand-icon"
        name="chevron-right"
        :class="{ open: isExpanded }"
      />
    </button>
    <div v-if="hasDetails && isExpanded" class="item-details">
      <p v-if="description" class="description">{{ description }}</p>
      <PanelGroupedListSubItems v-if="showSubItems" :group="group" :item="item" />
      <PanelGroupedListComments v-if="showComments" :group="group" :item="item" />
      <div v-if="showEdit" class="item-actions">
        <button class="edit-button" type="button" @click="state.onEditItem(group, item)">
          Edit
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.item {
  border-radius: var(--border-radius-normal);
  border: 1px solid var(--theme-general-border-color);
  background: var(--theme-main-components-main-background);

  > .item-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.6rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;

    > .item-icon {
      font-size: 1.1rem;
      color: var(--theme-general-color);
    }

    > .item-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;

      > .item-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        font-weight: var(--font-weight-medium);
        color: var(--theme-general-color);

        > .status {
          font-size: 0.7rem;
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          background: var(--theme-general-border-color);
          color: var(--theme-general-muted, #6b7280);
        }
      }

      > .item-meta {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.75rem;
        color: var(--theme-general-muted, #6b7280);

        > .comments {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;

          > .comment-icon {
            font-size: 0.85rem;
          }
        }
      }
    }

    > .expand-icon {
      margin-left: auto;
      transition: transform 0.2s ease;

      &.open {
        transform: rotate(90deg);
      }
    }
  }

  > .item-details {
    border-top: 1px solid var(--theme-general-border-color);
    padding: 0.6rem 0.8rem 0.8rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;

    > .description {
      margin: 0;
      color: var(--theme-general-color);
      font-size: 0.85rem;
      line-height: 1.4;
    }

    > .item-actions {
      display: flex;
      justify-content: flex-end;

      > .edit-button {
        border: 1px solid var(--theme-general-border-color);
        background: transparent;
        color: var(--theme-general-color);
        padding: 0.4rem 0.7rem;
        border-radius: var(--border-radius-normal);
        cursor: pointer;

        &:hover {
          background: var(--theme-general-border-color);
        }
      }
    }
  }
}
</style>
