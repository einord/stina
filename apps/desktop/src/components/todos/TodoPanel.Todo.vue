<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';

  import { t } from '@stina/i18n';
  import { formatRelativeTime } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/todos';
  import { ref } from 'vue';

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

  function formatDue(ts: number) {
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
      <div class="title">{{ todo.title }}</div>
      <div v-if="todo.commentCount && todo.commentCount > 0" class="comment">
        <ChatBubbleIcon class="icon" />
        <span>{{ todo.commentCount }}</span>
      </div>
      <p v-if="todo.dueAt" class="due">
        {{ t('todos.due_at', { date: formatDue(todo.dueAt) }) }}
      </p>
    </div>
    <div class="body" :class="{ isOpen }">
      <p v-if="todo.description" class="todo-description">{{ todo.description }}</p>
      <p v-else class="todo-meta">
        {{ t('todos.created_at', { date: formatCreated(todo.createdAt) }) }}
      </p>
      <div class="todo-meta-row">
        <span class="status-pill" :data-status="todo.status">{{ statusLabel(todo.status) }}</span>
      </div>
      <div v-if="isOpen" class="todo-comments">
        <p v-if="isLoading" class="comment-loading">
          {{ t('todos.loading_comments') }}
        </p>
        <p v-else-if="comments.length === 0" class="comment-empty">
          {{ t('todos.no_comments_yet') }}
        </p>
        <ul v-else class="comment-list">
          <li v-for="comment in comments" :key="comment.id" class="comment-item">
            <time class="comment-time">{{ formatCreated(comment.createdAt) }}</time>
            <p class="comment-text">{{ comment.content }}</p>
          </li>
        </ul>
      </div>
    </div>
  </article>
</template>

<style scoped>
  .todo {
    padding: 1rem;

    &:not(:last-child) {
      border-bottom: 1px solid var(--border);
    }

    > .header {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      cursor: pointer;

      > .title {
        font-weight: 600;
      }

      > .comment {
        border: 1px solid var(--border);
        background: transparent;
        border-radius: 2em;
        padding: 2px 8px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75rem;
        color: var(--text);

        &:hover {
          background-color: var(--panel);
        }

        > .icon {
          font-size: 14px;
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
      padding-top: 0.5rem;

      &.isOpen {
        max-height: 300px;
      }
    }
  }
  .todo-description {
    margin: 0 0 2em;
    color: var(--text);
  }
  .todo-meta {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .todo-meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2em;
    gap: 2em;
  }
  .status-pill {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.5rem;
    font-weight: 600;
    background: var(--empty-bg);
    border: 1px solid var(--border);
  }
  .todo-comments {
    margin-top: 3em;
    border-top: 1px solid var(--border);
    padding-top: 2em;
  }
  .comment-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2em;
  }
  .comment-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .comment-time {
    font-size: 0.5rem;
    color: var(--muted);
  }
  .comment-text {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text);
  }
  .comment-loading,
  .comment-empty {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
