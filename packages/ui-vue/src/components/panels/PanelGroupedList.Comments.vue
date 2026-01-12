<script setup lang="ts">
import { computed } from 'vue'
import { usePanelGroupedListContext } from './panelGroupedList.Context.js'
import type { PanelGroupedListRecord } from './panelGroupedList.Types.js'

const props = defineProps<{
  group: PanelGroupedListRecord
  item: PanelGroupedListRecord
}>()

const state = usePanelGroupedListContext()
const config = computed(() => state.view.value.item.comments)
const comments = computed(() => state.getItemComments(props.item))
const itemKey = computed(() => state.getItemKey(props.group, props.item))
const canAdd = computed(() => Boolean(config.value?.actions?.add))
const canDelete = computed(() => Boolean(config.value?.actions?.delete))
</script>

<template>
  <div class="comments-list">
    <div v-if="canAdd" class="comment-add">
      <input
        class="comment-input"
        type="text"
        :placeholder="config?.inputPlaceholder ?? 'Add comment'"
        :value="state.getCommentDraft(group, item)"
        @input="
          (event) => state.setCommentDraft(group, item, (event.target as HTMLInputElement).value)
        "
      />
      <button
        class="comment-add-button"
        type="button"
        :disabled="state.isActionBusy(`comment-add:${itemKey}`)"
        @click="state.onAddComment(group, item)"
      >
        Add
      </button>
    </div>
    <div
      v-for="comment in comments"
      :key="state.getCommentId(comment) || state.getCommentText(comment)"
      class="comment"
    >
      <span v-if="state.getCommentDate(comment)" class="comment-date">
        {{ state.getCommentDate(comment) }}
      </span>
      <span class="comment-text">{{ state.getCommentText(comment) }}</span>
      <button
        v-if="canDelete"
        class="comment-delete"
        type="button"
        :disabled="state.isActionBusy(`comment-delete:${itemKey}:${state.getCommentId(comment)}`)"
        @click="state.onDeleteComment(group, item, comment)"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<style scoped>
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  > .comment-add {
    display: flex;
    align-items: center;
    gap: 0.4rem;

    > .comment-input {
      flex: 1;
      border: 1px solid var(--theme-general-border-color);
      border-radius: var(--border-radius-normal);
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
      background: var(--theme-main-components-main-background);
      color: var(--theme-general-color);
    }

    > .comment-add-button {
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

  > .comment {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.8rem;
    color: var(--theme-general-color);

    > .comment-date {
      font-size: 0.7rem;
      color: var(--theme-general-muted, #6b7280);
    }

    > .comment-delete {
      align-self: flex-start;
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
