<template>
  <div class="todo-panel-content">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">Att göra</h2>
        <p class="panel-subtitle">Öppna uppgifter</p>
      </div>
      <span class="panel-count" :aria-label="`Antal öppna todos: ${pendingTodos.length}`">
        {{ pendingTodos.length }}
      </span>
    </header>
    <div v-if="pendingTodos.length" class="panel-body">
      <article v-for="todo in pendingTodos" :key="todo.id" class="todo-card">
        <div class="todo-title">{{ todo.title }}</div>
        <p v-if="todo.description" class="todo-description">{{ todo.description }}</p>
        <p v-if="todo.dueAt" class="todo-due">Förfaller {{ formatDue(todo.dueAt) }}</p>
        <p v-else class="todo-meta">Skapad {{ formatCreated(todo.createdAt) }}</p>
      </article>
    </div>
    <div v-else class="panel-empty">
      <p v-if="loading">Laddar todos…</p>
      <p v-else-if="errorMessage">{{ errorMessage }}</p>
      <p v-else>Allt klart! Inga öppna todos just nu.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { TodoItem } from '@stina/store';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  const todos = ref<TodoItem[]>([]);
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

  const pendingTodos = computed(() =>
    todos.value
      .filter((todo) => todo.status !== 'completed')
      .sort((a, b) => {
        const dueA = typeof a.dueAt === 'number' ? a.dueAt : Number.POSITIVE_INFINITY;
        const dueB = typeof b.dueAt === 'number' ? b.dueAt : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;
        return a.createdAt - b.createdAt;
      }),
  );

  async function loadTodos() {
    try {
      const snapshot = await window.stina.todos.get();
      todos.value = snapshot ?? [];
      errorMessage.value = null;
    } catch {
      errorMessage.value = 'Kunde inte ladda todos just nu.';
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

  onMounted(async () => {
    await loadTodos();
    const off = window.stina.todos.onChanged((items) => {
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
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .panel-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text);
  }
  .panel-subtitle {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .panel-count {
    min-width: 32px;
    text-align: center;
    padding: var(--space-1) var(--space-2);
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
  }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .panel-empty {
    flex: 1;
    padding: var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: var(--muted);
  }
  .todo-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-2);
    padding: var(--space-3);
    background: var(--panel);
  }
  .todo-title {
    font-weight: 600;
    margin-bottom: var(--space-1);
  }
  .todo-description {
    margin: 0 0 var(--space-2);
    color: var(--text);
  }
  .todo-due,
  .todo-meta {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--muted);
  }
</style>
