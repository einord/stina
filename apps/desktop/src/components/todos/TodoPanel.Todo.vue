<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import { formatRelativeTime } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/todos';
  import { ref } from 'vue';

  import MarkDown from '../MarkDown.vue';
  import IconToggleButton from '../ui/IconToggleButton.vue';

  import TodoEditModal from './TodoPanel.EditModal.vue';

  defineProps<{
    todo: Todo;
  }>();

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
  });

  const comments = ref<TodoComment[]>([]);
  const isOpen = ref(false);
  const isLoading = ref(false);
  const showEdit = ref(false);

  function statusLabel(status: TodoStatus) {
    return t(`todos.status.${status}`);
  }

  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: dueFormatter });
  }

  function formatDate(ts: number) {
    try {
      return dateFormatter.format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleDateString();
    }
  }

  async function toggleComments(id: string) {
    isOpen.value = !isOpen.value;
    if (!isOpen.value) return;
    if (comments.value.length === 0 && !isLoading.value) {
      isLoading.value = true;
      try {
        const fetchedComments = await window.stina.todos.getComments(id);
        comments.value = fetchedComments ?? [];
      } catch {
        comments.value = [];
      } finally {
        isLoading.value = false;
      }
    }
  }
</script>

<template>
  <article class="todo">
    <div class="header" @click="toggleComments(todo.id)">
      <div class="first-row">
        <div class="title">{{ todo.title }}</div>
        <div v-if="todo.commentCount && todo.commentCount > 0" class="comment">
          <ChatBubbleIcon class="icon" />
          <span>{{ todo.commentCount }}</span>
        </div>
      </div>
      <div class="second-row">
        <p v-if="todo.isAllDay && todo.dueAt" class="due">
          {{ t('todos.due_all_day', { date: formatDate(todo.dueAt) }) }}
        </p>
        <p v-else-if="todo.dueAt" class="due">
          {{ t('todos.due_at', { date: relativeTime(todo.dueAt) }) }}
        </p>
        <span class="status-pill" :class="[todo.status]">{{ statusLabel(todo.status) }}</span>
      </div>
    </div>
    <div class="body" :class="{ isOpen }">
      <MarkDown v-if="todo.description" class="description" :content="todo.description" />
      <div class="actions-row">
        <IconToggleButton
          :icon="EditIcon"
          :tooltip="t('todos.edit_title', { title: todo.title })"
          @click.stop="showEdit = true"
        />
      </div>
      <div v-if="isOpen && comments.length > 0" class="comments">
        <p v-if="isLoading" class="comment-loading">
          {{ t('todos.loading_comments') }}
        </p>
        <ul v-else class="comment-list">
          <li v-for="comment in comments" :key="comment.id" class="comment">
            <time class="comment-time">{{ relativeTime(comment.createdAt) }}</time>
            <p class="comment-text">{{ comment.content }}</p>
          </li>
        </ul>
      </div>
    </div>
    <TodoEditModal :todo="todo" :open="showEdit" @close="showEdit = false" />
  </article>
</template>

<style scoped>
  .todo {
    border-bottom: 1px solid var(--border);
    overflow-x: hidden;

    > .header {
      padding: 1rem;
      transition: all 0.2s ease-in-out;
      background-color: var(--panel-hover);
      cursor: pointer;

      &:hover {
        background-color: hsl(from var(--panel-hover) h s 22%);
      }

      > .first-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 0.5rem;

        > .title {
          font-weight: var(--font-weight-medium);
          flex-grow: 1;
        }

        > .comment {
          padding: 2px 8px;
          display: flex;
          align-items: center;
          gap: 0.5em;
          font-size: 0.75rem;
          margin-left: auto;

          > .icon {
            font-size: 1.2em;
          }
        }
      }

      > .second-row {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.5rem;

        > .due {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        > .status-pill {
          padding: 0.25rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.75rem;
          font-weight: var(--font-weight-thin);
          background: var(--accent);
          color: var(--accent-fg);
          margin-left: auto;

          &.not_started {
            background: var(--neutral);
            color: var(--neutral-fg);
            /* border: 1px solid var(--neutral-fg); */
          }
          &.in_progress {
            background: var(--info);
            color: var(--info-fg);
            /* border: 1px solid var(--info-fg); */
          }
          &.completed {
            background: var(--success);
            color: var(--success-fg);
            /* border: 1px solid var(--success-fg); */
          }
          &.cancelled {
            background: var(--error);
            color: var(--error-fg);
            /* border: 1px solid var(--error-fg); */
          }
        }
      }
    }

    > .body {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;

      &.isOpen {
        max-height: 300px;
        overflow: auto;
      }

      > .description {
        padding: 1rem 0 0 0;
        margin: 0 1rem;
        color: var(--text);
        font-size: 1rem;
        font-weight: var(--font-weight-light);
      }

      > .actions-row {
        display: flex;
        justify-content: flex-end;
        margin: 0.5rem 1rem;
      }

      > .comments {
        padding-bottom: 1rem;
        font-size: 0.75rem;

        > .comment-loading,
        > .comment-empty {
          margin: 0;
          font-size: 0.75rem;
          color: var(--muted);
        }

        > .comment-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;

          > .comment {
            display: flex;
            flex-direction: column;
            gap: 2px;
            background-color: var(--interactive-bg);
            margin: 0 1rem;
            padding: 1rem;
            border-radius: var(--border-radius-normal);

            > .comment-time {
              color: var(--muted);
            }

            > .comment-text {
              margin: 0;
              margin-left: 0.5rem;
              font-size: 1rem;
              color: var(--text);
            }
          }
        }
      }
    }
  }
</style>
