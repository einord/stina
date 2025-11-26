<template>
  <div class="todo-panel-content">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('todos.title') }}</h2>
        <p class="panel-subtitle">{{ t('todos.subtitle') }}</p>
      </div>
      <span
        class="panel-count"
        :aria-label="t('todos.count_aria', { count: String(pendingTodos.length) })"
      >
        {{ pendingTodos.length }}
      </span>
    </header>
    <div v-if="pendingTodos.length" class="panel-body">
      <article v-for="todo in pendingTodos" :key="todo.id" class="todo-card">
        <div class="todo-title">{{ todo.title }}</div>
        <p v-if="todo.description" class="todo-description">{{ todo.description }}</p>
        <p v-if="todo.dueAt" class="todo-due">
          {{ t('todos.due_at', { date: formatDue(todo.dueAt) }) }}
        </p>
        <p v-else class="todo-meta">
          {{ t('todos.created_at', { date: formatCreated(todo.createdAt) }) }}
        </p>
        <div class="todo-meta-row">
          <span class="status-pill" :data-status="todo.status">{{ statusLabel(todo.status) }}</span>
          <button
            v-if="todo.commentCount && todo.commentCount > 0"
            class="comment-toggle"
            type="button"
            @click="toggleComments(todo.id)"
          >
            <ChatBubbleIcon class="comment-icon" />
            <span>{{ todo.commentCount }}</span>
          </button>
        </div>
        <div v-if="isCommentsOpen(todo.id)" class="todo-comments">
          <p v-if="isLoadingComments(todo.id)" class="comment-loading">
            {{ t('todos.loading_comments') }}
          </p>
          <p v-else-if="getComments(todo.id).length === 0" class="comment-empty">
            {{ t('todos.no_comments_yet') }}
          </p>
          <ul v-else class="comment-list">
            <li v-for="comment in getComments(todo.id)" :key="comment.id" class="comment-item">
              <time class="comment-time">{{ formatCreated(comment.createdAt) }}</time>
              <p class="comment-text">{{ comment.content }}</p>
            </li>
          </ul>
        </div>
      </article>
    </div>
    <div v-else class="panel-empty">
      <p v-if="loading">{{ t('todos.loading_todos') }}</p>
      <p v-else-if="errorMessage">{{ t('todos.failed_to_load') }}</p>
      <p v-else>{{ t('todos.all_done') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';

  import { t } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/todos';
  import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

  const todos = ref<Todo[]>([]);
  const loading = ref(true);
  const errorMessage = ref<string | null>(null);
  const disposables: Array<() => void> = [];
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';
  const dueFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const createdFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
  });

  const commentCache = reactive<Record<string, TodoComment[]>>({});
  const expanded = reactive<Record<string, boolean>>({});
  const loadingComments = reactive<Record<string, boolean>>({});

  const pendingTodos = computed(() =>
    todos.value
      .filter((todo) => todo.status !== 'completed' && todo.status !== 'cancelled')
      .sort((a, b) => {
        const dueA = typeof a.dueAt === 'number' ? a.dueAt : Number.POSITIVE_INFINITY;
        const dueB = typeof b.dueAt === 'number' ? b.dueAt : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return a.createdAt - b.createdAt;
      }),
  );

  function statusLabel(status: TodoStatus) {
    return t(`todos.status.${status}`);
  }

  async function loadTodos() {
    try {
      const snapshot = await window.stina.todos.get();
      todos.value = snapshot ?? [];
      errorMessage.value = null;
    } catch {
      errorMessage.value = t('todos.failed_to_load');
    } finally {
      loading.value = false;
    }
  }

  function formatDue(ts: number) {
    try {
      return dueFormatter.format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleString();
    }
  }

  function formatCreated(ts: number) {
    try {
      return createdFormatter.format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleDateString();
    }
  }

  function getComments(id: string): TodoComment[] {
    return commentCache[id] ?? [];
  }

  function isCommentsOpen(id: string): boolean {
    return expanded[id] === true;
  }

  function isLoadingComments(id: string): boolean {
    return loadingComments[id] === true;
  }

  async function toggleComments(id: string) {
    expanded[id] = !expanded[id];
    if (!expanded[id]) return;
    if (!commentCache[id] && !loadingComments[id]) {
      loadingComments[id] = true;
      try {
        const comments = await window.stina.todos.getComments(id);
        commentCache[id] = comments ?? [];
      } catch {
        commentCache[id] = [];
      } finally {
        loadingComments[id] = false;
      }
    }
  }

  onMounted(async () => {
    await loadTodos();
    const off = window.stina.todos.onChanged((items: Todo[] | null | undefined) => {
      todos.value = items ?? [];
      if (errorMessage.value) errorMessage.value = null;
    });
    disposables.push(off);
  });

  onUnmounted(() => {
    disposables.splice(0).forEach((dispose) => {
      try {
        dispose?.();
      } catch {
        /* noop */
      }
    });
  });
</script>

<style scoped>
  .todo-panel-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
    padding: 1rem;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
  }
  .panel-subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .panel-count {
    min-width: 32px;
    text-align: center;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
  }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3em;
  }
  .panel-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--muted);
  }
  .todo-card {
    border: 1px solid var(--border);
    border-radius: 2em;
    padding: 1rem;
    background: var(--panel);
  }
  .todo-title {
    font-weight: 600;
  }
  .todo-description {
    margin: 0 0 2em;
    color: var(--text);
  }
  .todo-due,
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
  .comment-toggle {
    border: 1px solid var(--border);
    background: transparent;
    border-radius: 2em;
    padding: 2px 8px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--text);
    cursor: pointer;
  }
  .comment-toggle:hover {
    background: var(--panel);
  }
  .comment-icon {
    font-size: 14px;
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
