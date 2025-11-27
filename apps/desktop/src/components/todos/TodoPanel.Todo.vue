<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';

  import { t } from '@stina/i18n';
  import { formatRelativeTime } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/todos';
  import { ref } from 'vue';

  import MarkDown from '../MarkDown.vue';

  interface Props {
    todo: Todo;
  }

  defineProps<Props>();

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const createdFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
  });

  const comments = ref<TodoComment[]>([]);
  const isOpen = ref(false);
  const isLoading = ref(false);

  function statusLabel(status: TodoStatus) {
    return t(`todos.status.${status}`);
  }

  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: dueFormatter });
  }

  function formatCreated(ts: number) {
    try {
      return createdFormatter.format(new Date(ts));
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
      <div class="title-row">
        <div class="title">{{ todo.title }}</div>
        <span v-if="todo.projectName" class="project">
          {{ todo.projectName }}
        </span>
      </div>
      <div v-if="todo.commentCount && todo.commentCount > 0" class="comment">
        <ChatBubbleIcon class="icon" />
        <span>{{ todo.commentCount }}</span>
      </div>
      <p v-if="todo.dueAt" class="due">
        {{ t('todos.due_at', { date: relativeTime(todo.dueAt) }) }}
      </p>
    </div>
    <div class="body" :class="{ isOpen }">
      <MarkDown v-if="todo.description" class="description" :content="todo.description" />
      <div class="meta">
        <div class="created">
          {{ t('todos.created_at', { date: relativeTime(todo.createdAt) }) }}
        </div>
        <span class="status-pill" :data-status="todo.status">{{ statusLabel(todo.status) }}</span>
      </div>
      <div v-if="isOpen" class="comments">
        <p v-if="isLoading" class="comment-loading">
          {{ t('todos.loading_comments') }}
        </p>
        <p v-else-if="comments.length === 0" class="comment-empty">
          {{ t('todos.no_comments_yet') }}
        </p>
        <ul v-else class="comment-list">
          <li v-for="comment in comments" :key="comment.id" class="comment">
            <time class="comment-time">{{ relativeTime(comment.createdAt) }}</time>
            <p class="comment-text">{{ comment.content }}</p>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>

<style scoped>
  .todo {
    border-bottom: 1px solid var(--border);
    overflow-x: hidden;

    > .header {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      cursor: pointer;
      padding: 1rem;
      transition: all 0.2s ease-in-out;

      &:hover {
        background-color: var(--panel-hover);
      }

      > .title-row {
        display: flex;
        align-items: start;
        gap: 0.5rem;

        > .title {
          font-weight: var(--font-weight-medium);
          flex-grow: 1;
        }

        > .project {
          font-size: 0.75rem;
          padding: 2px 8px;
          color: var(--muted);
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      > .comment {
        padding: 2px 8px;
        display: flex;
        align-items: center;
        gap: 0.5em;
        font-size: 0.75rem;

        > .icon {
          font-size: 1.2em;
        }
      }

      > .due {
        margin: 0;
        font-size: 0.75rem;
        color: var(--muted);
      }
    }

    > .body {
      max-height: 0;
      overflow: auto;
      transition: max-height 0.3s ease;
      margin: 0 1rem;

      &.isOpen {
        max-height: 300px;
      }

      > .description {
        padding: 0.5rem 0 0 0;
        margin: 0;
        color: var(--text);
        font-size: 0.85rem;
        font-weight: var(--font-weight-light);
      }

      > .meta {
        margin-top: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;

        > .created {
          font-size: 0.75rem;
          color: var(--muted);
          flex-grow: 1;
        }

        > .status-pill {
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 0.75rem;
          font-weight: 600;
          background: var(--accent);
          color: var(--accent-fg);
          border: 1px solid var(--accent-fg);
        }
      }

      > .comments {
        margin-top: 1rem;
        border-top: 1px solid var(--border);
        padding-top: 1rem;
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
          gap: 2em;

          > .comment {
            display: flex;
            flex-direction: column;
            gap: 2px;

            > .comment-time {
              color: var(--muted);
            }

            > .comment-text {
              margin: 0;
              margin-left: 0.5rem;
              font-size: 0.75rem;
              color: var(--text);
            }
          }
        }
      }
    }
  }
</style>
