<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';
  import EditIcon from '~icons/hugeicons/edit-01';
  import RepeatIcon from '~icons/hugeicons/repeat';

  import { t } from '@stina/i18n';
  import { formatRelativeTime } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/work';
  import { computed, ref, watch } from 'vue';

  import { emitSettingsNavigation } from '../../lib/settingsNavigation';
  import { resolveQuickCommandIcon } from '../../lib/quickCommandIcons';
  import MarkDown from '../MarkDown.vue';
  import PanelGroupItem from '../common/PanelGroup.Item.vue';
  import IconToggleButton from '../ui/IconToggleButton.vue';

  import TodoEditModal from './TodoPanel.EditModal.vue';

  const props = defineProps<{
    todo: Todo;
    muted?: boolean;
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
  const steps = ref<Todo['steps']>([]);
  const deleting = ref<Set<string>>(new Set());
  const isOverdue = computed(() => {
    if (!props.todo.dueAt) return false;
    if (props.todo.status === 'completed' || props.todo.status === 'cancelled') return false;
    return props.todo.dueAt < Date.now();
  });
  const todoIconComponent = computed(() => resolveQuickCommandIcon(props.todo.icon ?? undefined));

  const stepStats = computed(() => {
    const total = steps.value?.length ?? 0;
    const done = steps.value?.filter((s) => s.isDone)?.length ?? 0;
    return { total, done };
  });

  /**
   * Returns the translated status label for a todo status.
   */
  function statusLabel(status: TodoStatus) {
    return t(`todos.status.${status}`);
  }

  /**
   * Formats a timestamp to a human-readable relative time string.
   */
  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: dueFormatter });
  }

  /**
   * Formats a timestamp to a date string in the current locale.
   */
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

  async function deleteComment(id: string) {
    if (!id || deleting.value.has(id)) return;
    if (!confirm(t('todos.confirm_delete_comment'))) return;
    deleting.value.add(id);
    try {
      const ok = await window.stina.todos.deleteComment?.(id);
      if (ok) {
        comments.value = comments.value.filter((c) => c.id !== id);
      }
    } catch {
      /* ignore */
    } finally {
      deleting.value.delete(id);
    }
  }

  /**
   * Opens the settings view focused on the recurring template that spawned this todo.
   */
  function openRecurringSettings(templateId: string | null | undefined) {
    if (!templateId) return;
    emitSettingsNavigation({ group: 'work', recurringTemplateId: templateId });
  }

  async function toggleStep(stepId: string, current: boolean) {
    try {
      await window.stina.todos.updateStep?.(stepId, { isDone: !current });
    } catch {
      /* ignore */
    }
  }

  watch(
    () => props.todo.steps,
    (next) => {
      steps.value = next ? [...next] : [];
    },
    { immediate: true },
  );
</script>

<template>
  <PanelGroupItem
    :title="todo.title"
    :meta="
      todo.isAllDay && todo.dueAt
        ? t('todos.due_all_day', { date: formatDate(todo.dueAt) })
        : todo.dueAt
          ? t('todos.due_at', { date: relativeTime(todo.dueAt) })
          : undefined
    "
    :meta-variant="isOverdue ? 'danger' : 'default'"
    :status="statusLabel(todo.status)"
    :status-details="
      stepStats.total > 0
        ? t('todos.steps_progress', {
            done: String(stepStats.done),
            total: String(stepStats.total),
          })
        : undefined
    "
    :status-variant="
      todo.status === 'not_started'
        ? 'neutral'
        : todo.status === 'in_progress'
          ? 'info'
          : todo.status === 'completed'
            ? 'success'
            : todo.status === 'cancelled'
              ? 'error'
              : 'default'
    "
    :muted="muted"
    @toggle="toggleComments(todo.id)"
  >
    <template #leading>
      <component :is="todoIconComponent" class="todo-icon" aria-hidden="true" />
    </template>
    <template #badge>
      <div v-if="todo.commentCount && todo.commentCount > 0" class="comment">
        <ChatBubbleIcon class="icon" />
        <span>{{ todo.commentCount }}</span>
      </div>
    </template>
    <MarkDown v-if="todo.description" class="description" :content="todo.description" />
    <div class="actions-row">
      <IconToggleButton
        v-if="todo.recurringTemplateId"
        :icon="RepeatIcon"
        :tooltip="t('todos.recurring_open_settings')"
        @click.stop="openRecurringSettings(todo.recurringTemplateId)"
      />
      <IconToggleButton
        :icon="EditIcon"
        :tooltip="t('todos.edit_title', { title: todo.title })"
        @click.stop="showEdit = true"
      />
    </div>
    <div v-if="stepStats.total > 0" class="steps">
      <div class="steps-header">
        <h3>{{ t('todos.steps_label') }}</h3>
        <span v-if="stepStats.total" class="progress">
          {{
            t('todos.steps_progress', {
              done: String(stepStats.done),
              total: String(stepStats.total),
            })
          }}
        </span>
      </div>
      <ul class="steps-list">
        <li v-for="step in steps" :key="step.id" class="step">
          <label>
            <input
              type="checkbox"
              :checked="step.isDone"
              @change="toggleStep(step.id, step.isDone)"
            />
            <span :class="{ done: step.isDone }">{{ step.title }}</span>
          </label>
        </li>
      </ul>
    </div>
    <div v-if="isOpen && comments.length > 0" class="comments">
      <h3>{{ t('todos.comments_label') }}</h3>
      <p v-if="isLoading" class="comment-loading">
        {{ t('todos.loading_comments') }}
      </p>
      <ul v-else class="comment-list">
        <li v-for="comment in comments" :key="comment.id" class="comment">
          <div class="comment-header">
            <time class="comment-time">{{ relativeTime(comment.createdAt) }}</time>
            <button
              class="comment-delete"
              type="button"
              :aria-label="t('todos.delete_comment')"
              :title="t('todos.delete_comment')"
              @click.stop="deleteComment(comment.id)"
            >
              ×
            </button>
          </div>
          <p class="comment-text">{{ comment.content }}</p>
        </li>
      </ul>
    </div>
    <TodoEditModal :todo="todo" :open="showEdit" @close="showEdit = false" />
  </PanelGroupItem>
</template>

<style scoped>
  .comment {
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

  .description {
    padding: 1rem 0 0 0;
    margin: 0 1rem;
    color: var(--text);
    font-size: 1rem;
    font-weight: var(--font-weight-light);
  }

  .todo-icon {
    width: 1.35rem;
    height: 1.35rem;
    color: var(--text);
    flex-shrink: 0;
  }

  .actions-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.35rem;
    margin: 0.5rem 1rem;
  }

  .comments {
    padding: 0 1rem 1rem 1rem;
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
        gap: 4px;
        background-color: var(--interactive-bg);
        margin: 0;
        padding: 1rem;
        border-radius: var(--border-radius-normal);

        > .comment-header {
          display: flex;
          align-items: center;
          justify-content: space-between;

          > .comment-time {
            color: var(--muted);
          }

          > .comment-delete {
            border: none;
            background: transparent;
            color: var(--muted);
            font-size: 1.1rem;
            line-height: 1;
            cursor: pointer;
            padding: 0.15rem 0.35rem;
            border-radius: var(--border-radius-small);
            transition:
              background-color 0.15s ease,
              color 0.15s ease;

            &:hover {
              background-color: var(--border-light);
              color: var(--text);
            }
          }
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

  .steps {
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 1rem;

    > .steps-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: var(--font-weight-medium);
      font-size: 0.9rem;
    }

    > .steps-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;

      > .step {
        display: flex;
        align-items: center;

        > label {
          display: flex;
          align-items: center;
          gap: 0.5rem;

          > input {
            accent-color: var(--primary);
          }

          > .done {
            text-decoration: line-through;
            color: var(--muted);
          }
        }
      }
    }

    > .steps-empty {
      margin: 0;
      color: var(--muted);
      font-size: 0.85rem;
    }

    > .progress {
      color: var(--muted);
      font-size: 0.85rem;
    }
  }
</style>
