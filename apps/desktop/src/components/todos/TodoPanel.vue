<script setup lang="ts">
  import CheckListIcon from '~icons/hugeicons/check-list';
  import CheckmarkSquareIcon from '~icons/hugeicons/checkmark-square-03';

  import { t } from '@stina/i18n';
  import type { Todo } from '@stina/work';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import PanelGroup from '../common/PanelGroup.vue';

  import TodoPanelTodo from './TodoPanel.Todo.vue';

  const NO_PROJECT_KEY = '__no_project__';
  const CLOSED_GROUP_KEY = 'closed-today';

  type TodoGroup = {
    key: string;
    title: string;
    items: Todo[];
  };

  const todos = ref<Todo[]>([]);
  const loading = ref(true);
  const errorMessage = ref<string | null>(null);
  const disposables: Array<() => void> = [];
  const collapsedGroups = ref<Set<string>>(new Set([CLOSED_GROUP_KEY]));

  const CheckIcon = CheckListIcon;
  const CheckmarkIcon = CheckmarkSquareIcon;

  const startOfToday = computed(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

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

  const groupedTodos = computed<TodoGroup[]>(() => {
    const groups = new Map<string, TodoGroup>();
    for (const todo of pendingTodos.value) {
      const key = todo.projectId ?? NO_PROJECT_KEY;
      const title = todo.projectName || t('todos.no_project');
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(todo);
      } else {
        groups.set(key, { key, title, items: [todo] });
      }
    }
    return Array.from(groups.values());
  });

  const todaysClosedTodos = computed(() =>
    todos.value
      .filter(
        (todo) =>
          (todo.status === 'completed' || todo.status === 'cancelled') &&
          todo.updatedAt >= startOfToday.value,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt),
  );

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups.value = next;
    void persistCollapsedGroups(next);
  }

  async function persistCollapsedGroups(next: Set<string>) {
    try {
      await window.stina.desktop.setCollapsedTodoProjects(Array.from(next));
    } catch {
      /* ignore persistence errors */
    }
  }

  async function hydrateCollapsedGroups() {
    try {
      const saved = await window.stina.desktop.getCollapsedTodoProjects();
      if (saved === undefined) {
        const initial = new Set<string>([CLOSED_GROUP_KEY]);
        collapsedGroups.value = initial;
        await window.stina.desktop.setCollapsedTodoProjects(Array.from(initial));
        return;
      }
      collapsedGroups.value = new Set(saved);
    } catch {
      collapsedGroups.value = new Set([CLOSED_GROUP_KEY]);
    }
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
    await Promise.all([loadTodos(), hydrateCollapsedGroups()]);
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
    <FormHeader :title="t('todos.title_header')" />
    <PanelGroup
      v-if="groupedTodos && groupedTodos.length > 0"
      v-for="group in groupedTodos"
      :key="group.key"
      class="group"
      :title="group.title"
      :description="t('todos.items_count', { count: group.items.length })"
      :collapsed="collapsedGroups.has(group.key)"
      :iconComponent="CheckIcon"
      @toggle="toggleGroup(group.key)"
    >
      <TodoPanelTodo v-for="todo in group.items" :key="todo.id" :todo="todo" />
    </PanelGroup>
    <PanelGroup
      v-if="todaysClosedTodos.length > 0"
      class="group closed-group"
      :title="t('todos.completed_today_title')"
      :description="t('todos.completed_today_description', { count: todaysClosedTodos.length })"
      :collapsed="collapsedGroups.has(CLOSED_GROUP_KEY)"
      :iconComponent="CheckmarkIcon"
      @toggle="toggleGroup(CLOSED_GROUP_KEY)"
    >
      <TodoPanelTodo v-for="todo in todaysClosedTodos" :key="todo.id" :todo="todo" :muted="true" />
    </PanelGroup>
    <div
      v-else-if="groupedTodos.length === 0 && todaysClosedTodos.length === 0"
      class="panel-empty"
    >
      <p v-if="loading">{{ t('todos.loading_todos') }}</p>
      <p v-else-if="errorMessage">{{ t('todos.failed_to_load') }}</p>
      <p v-else>{{ t('todos.all_done') }}</p>
    </div>
  </div>
</template>

<style scoped>
  .todo-panel-content {
    padding: 0 1rem 1rem 1rem;
    overflow-y: auto;

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
