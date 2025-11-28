<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Todo } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import FormHeader from '../common/FormHeader.vue';

  import TodoPanelTodo from './TodoPanel.Todo.vue';

  const todos = ref<Todo[]>([]);
  const loading = ref(true);
  const errorMessage = ref<string | null>(null);
  const disposables: Array<() => void> = [];
  const collapsedGroups = ref<Set<string>>(new Set());

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

  const groupedTodos = computed(() => {
    const groups = new Map<string, Todo[]>();
    for (const todo of pendingTodos.value) {
      const key = todo.projectName || t('todos.no_project');
      const list = groups.get(key) ?? [];
      list.push(todo);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  });

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups.value = next;
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

<template>
  <div class="todo-panel-content">
    <section
      v-if="groupedTodos"
      v-for="[groupName, items] in groupedTodos"
      :key="groupName"
      class="group"
    >
      <FormHeader
        class="header"
        :title="groupName"
        :description="t('todos.items_count', { count: items.length })"
        @click="toggleGroup(groupName)"
      />
      <div class="content">
        <div v-if="!collapsedGroups.has(groupName)" class="group-list">
          <TodoPanelTodo v-for="todo in items" :key="todo.id" :todo="todo" />
        </div>
      </div>
    </section>
    <div v-else class="panel-empty">
      <p v-if="loading">{{ t('todos.loading_todos') }}</p>
      <p v-else-if="errorMessage">{{ t('todos.failed_to_load') }}</p>
      <p v-else>{{ t('todos.all_done') }}</p>
    </div>
  </div>
</template>

<style scoped>
  .todo-panel-content {
    height: 100%;
    max-height: 100%;
    padding: 0 1rem 1rem 1rem;
    overflow-y: auto;

    > .group {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid var(--border);
      background-color: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      overflow: auto;

      &:not(:first-child) {
        margin-top: 1rem;
      }

      &.grouped {
        gap: 0.75rem;
      }

      > .header {
        padding: 1rem;
        cursor: pointer;
        background-color: var(--border);
        transition: all 0.2s ease-in-out;

        &:hover {
          background-color: var(--border-dark);
        }
      }

      > .content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;

        > .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;

          > .group-title {
            margin: 0;
            font-size: 1rem;
          }
        }

        > .group-list {
          display: flex;
          flex-direction: column;
        }
      }
    }

    > .panel-empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      color: var(--muted);
      height: 100%;
    }
  }
</style>
