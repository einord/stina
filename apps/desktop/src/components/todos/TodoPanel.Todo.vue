<script setup lang="ts">
  import ChatBubbleIcon from '~icons/hugeicons/bubble-chat';
  import EditIcon from '~icons/hugeicons/edit-01';
  import RepeatIcon from '~icons/hugeicons/repeat';

  import { t } from '@stina/i18n';
  import { formatRelativeTime } from '@stina/i18n';
  import type { Todo, TodoComment, TodoStatus } from '@stina/work';
  import { computed, ref, watch } from 'vue';

  import { emitSettingsNavigation } from '../../lib/settingsNavigation';
  import MarkDown from '../MarkDown.vue';
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

  const stepStats = computed(() => {
    const total = steps.value?.length ?? 0;
    const done = steps.value?.filter((s) => s.isDone)?.length ?? 0;
    return { total, done };
  });

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
  <article class="todo" :class="{ muted }">
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
        <span v-if="stepStats.total" class="steps-pill"> </span>
        <span class="status-pill" :class="[todo.status]">
          <span>{{ statusLabel(todo.status) }}</span>
          <span v-if="stepStats.total > 0">{{
            t('todos.steps_progress', {
              done: String(stepStats.done),
              total: String(stepStats.total),
            })
          }}</span>
        </span>
      </div>
    </div>
    <div class="body" :class="{ isOpen }">
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
      <div v-if="isOpen && stepStats.total > 0" class="steps">
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
    </div>
    <TodoEditModal :todo="todo" :open="showEdit" @close="showEdit = false" />
  </article>
</template>

<style scoped>
  .todo {
    border-bottom: 1px solid var(--border);
    overflow-x: hidden;
    transition:
      opacity 0.2s ease,
      filter 0.2s ease;

    &.muted {
      opacity: 0.6;
      filter: grayscale(0.2);
    }

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
          display: inline-flex;
          gap: 0.5em;
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
        /* max-height: 80vh; */
        max-height: max-content;
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
        align-items: center;
        gap: 0.35rem;
        margin: 0.5rem 1rem;
      }

      > .comments {
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
                transition: background-color 0.15s ease, color 0.15s ease;

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

      > .steps {
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.35rem;

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
    }
  }

  .steps-pill {
    padding: 0.25rem 0.5rem;
    border-radius: 0.6rem;
    font-size: 0.75rem;
    background: var(--interactive-bg);
    color: var(--muted);
  }
</style>
