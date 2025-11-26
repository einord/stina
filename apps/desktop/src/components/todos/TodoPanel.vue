<template>
  <div class="todo-panel-content">
    <TodoPanelHeader :count="pendingTodos.length" />
    <div v-if="pendingTodos.length" class="panel-body">
      <TodoPanelTodo v-for="todo in pendingTodos" :key="todo.id" :todo="todo" />
    </div>
    <div v-else class="panel-empty">
      <p v-if="loading">{{ t('todos.loading_todos') }}</p>
      <p v-else-if="errorMessage">{{ t('todos.failed_to_load') }}</p>
      <p v-else>{{ t('todos.all_done') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Todo } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import TodoPanelHeader from './TodoPanel.Header.vue';
  import TodoPanelTodo from './TodoPanel.Todo.vue';

  const todos = ref<Todo[]>([]);
  const loading = ref(true);
  const errorMessage = ref<string | null>(null);
  const disposables: Array<() => void> = [];

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

    > .panel-body {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;

      background-color: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      overflow: auto;
    }

    > .panel-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--muted);
    }
  }
</style>
