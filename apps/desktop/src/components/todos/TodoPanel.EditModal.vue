<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Project, Todo, TodoStatus } from '@stina/work';
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

  import {
    QUICK_COMMAND_ICONS,
    resolveQuickCommandIcon,
    searchHugeicons,
  } from '../../lib/quickCommandIcons';
  import BaseModal from '../common/BaseModal.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormDate from '../form/FormDate.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormSelect from '../form/FormSelect.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import FormTime from '../form/FormTime.vue';

  const props = defineProps<{
    todo: Todo;
    open: boolean;
  }>();

  const emit = defineEmits<{
    close: [];
  }>();

  const saving = ref(false);
  const saveError = ref<string | null>(null);
  const saveSuccess = ref(false);
  const editStatus = ref<TodoStatus>('not_started');
  const editIsAllDay = ref(false);
  const editDueDate = ref('');
  const editDueTime = ref('');
  const editReminderMinutes = ref<number | null>(null);
  const editSteps = ref<
    Array<{ id: string; title: string; isDone: boolean; orderIndex: number; local?: boolean }>
  >([]);
  const newStepTitle = ref('');
  const draggingStepId = ref<string | null>(null);
  const projects = ref<Project[]>([]);
  const selectedProjectId = ref<string | null>(null);
  const projectsError = ref<string | null>(null);
  const editTitle = ref('');
  const editDescription = ref('');
  const editIcon = ref<string | null>(null);
  const iconSearch = ref('');
  const iconSearchResults = ref<string[]>([]);
  const iconSearchLoading = ref(false);
  const iconSearchError = ref<string | null>(null);
  let iconSearchTimeout: number | null = null;

  const statusOptions: TodoStatus[] = ['not_started', 'in_progress', 'completed', 'cancelled'];

  function pad(num: number) {
    return String(num).padStart(2, '0');
  }

  const hasDueTime = computed(() => !editIsAllDay.value);

  const reminderOptions = computed(() => [
    { value: '', label: t('settings.work.reminder_none') },
    ...[0, 5, 15, 30, 60].map((opt) => ({
      value: opt,
      label:
        opt === 0
          ? t('settings.work.reminder_at_time')
          : t('settings.work.reminder_minutes', { minutes: String(opt) }),
    })),
  ]);

  const showingIconSearchResults = computed(() => iconSearch.value.trim().length > 0);
  const displayedIcons = computed(() => {
    if (showingIconSearchResults.value) {
      return iconSearchResults.value.map((value) => ({
        value,
        component: resolveQuickCommandIcon(value),
      }));
    }
    return QUICK_COMMAND_ICONS;
  });

  function toDateInput(ts: number | null | undefined) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toTimeInput(ts: number | null | undefined) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromInputs(): number | null {
    if (!editDueDate.value) return null;
    const [year, month, day] = editDueDate.value.split('-').map(Number);
    if (editIsAllDay.value) {
      return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
    }
    const time = editDueTime.value || '00:00';
    const [hour, minute] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  }

  function resetForm() {
    editStatus.value = props.todo.status;
    editTitle.value = props.todo.title ?? '';
    editDescription.value = props.todo.description ?? '';
    editIsAllDay.value = !!props.todo.isAllDay;
    editDueDate.value = toDateInput(props.todo.dueAt);
    editDueTime.value = toTimeInput(props.todo.dueAt);
    editReminderMinutes.value = props.todo.reminderMinutes ?? null;
    selectedProjectId.value = props.todo.projectId ?? null;
    editIcon.value = props.todo.icon ?? null;
    iconSearch.value = '';
    iconSearchResults.value = [];
    iconSearchError.value = null;
    editSteps.value = (props.todo.steps ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((step) => ({ ...step }));
    saveError.value = null;
    saveSuccess.value = false;
  }

  watch(
    () => props.todo,
    () => {
      resetForm();
    },
    { immediate: true },
  );

  function close() {
    emit('close');
    saveError.value = null;
    saveSuccess.value = false;
    iconSearch.value = '';
    iconSearchResults.value = [];
    iconSearchError.value = null;
  }

  function clearDue() {
    editDueDate.value = '';
    editDueTime.value = '';
    editReminderMinutes.value = null;
  }

  async function addStep() {
    const title = newStepTitle.value.trim();
    if (!title) return;
    try {
      const created = await window.stina.todos.addSteps?.(props.todo.id, [
        { title, orderIndex: editSteps.value.length },
      ]);
      if (created?.length) {
        editSteps.value = [...editSteps.value, ...created];
      }
    } catch {
      /* ignore add error */
    } finally {
      newStepTitle.value = '';
    }
  }

  async function updateStepTitle(id: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const updated = await window.stina.todos.updateStep?.(id, { title: trimmed });
      if (updated) {
        editSteps.value = editSteps.value.map((step) => (step.id === id ? { ...step, title: updated.title } : step));
      }
    } catch {
      /* ignore */
    }
  }

  async function toggleStepDone(id: string, current: boolean) {
    try {
      const updated = await window.stina.todos.updateStep?.(id, { isDone: !current });
      if (updated) {
        editSteps.value = editSteps.value.map((step) =>
          step.id === id ? { ...step, isDone: updated.isDone, orderIndex: updated.orderIndex } : step,
        );
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteStep(id: string) {
    try {
      const ok = await window.stina.todos.deleteStep?.(id);
      if (ok) {
        editSteps.value = editSteps.value.filter((step) => step.id !== id);
      }
    } catch {
      /* ignore */
    }
  }

  async function reorderSteps(orderedIds: string[]) {
    if (!orderedIds.length) return;
    try {
      const updated = await window.stina.todos.reorderSteps?.(props.todo.id, orderedIds);
      if (updated?.length) {
        editSteps.value = updated;
      }
    } catch {
      /* ignore */
    }
  }

  function onDragStart(id: string) {
    draggingStepId.value = id;
  }

  function onDrop(targetId: string) {
    if (!draggingStepId.value || draggingStepId.value === targetId) return;
    const current = [...editSteps.value];
    const from = current.findIndex((s) => s.id === draggingStepId.value);
    const to = current.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    editSteps.value = current.map((step, idx) => ({ ...step, orderIndex: idx }));
    draggingStepId.value = null;
    void reorderSteps(editSteps.value.map((s) => s.id));
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async function loadProjects() {
    try {
      projects.value = (await window.stina.projects.get()) ?? [];
      projectsError.value = null;
    } catch (err) {
      projectsError.value = t('settings.work.error');
    }
  }

  function updateReminderMinutes(val: string | number | null) {
    if (val === '' || val === null) {
      editReminderMinutes.value = null;
      return;
    }
    editReminderMinutes.value = Number(val);
  }

  async function performIconSearch(term: string) {
    const query = term.trim();
    if (!query) {
      iconSearchResults.value = [];
      iconSearchError.value = null;
      iconSearchLoading.value = false;
      return;
    }

    iconSearchLoading.value = true;
    iconSearchError.value = null;
    try {
      iconSearchResults.value = await searchHugeicons(query, 200);
    } catch (error) {
      iconSearchError.value = t('todos.icon_search_error');
      iconSearchResults.value = [];
    } finally {
      iconSearchLoading.value = false;
    }
  }

  watch(
    iconSearch,
    (term) => {
      if (iconSearchTimeout) window.clearTimeout(iconSearchTimeout);
      iconSearchTimeout = window.setTimeout(() => performIconSearch(term), 200);
    },
    { immediate: false },
  );

  async function saveChanges() {
    if (!window.stina.todos.update) return;
    saving.value = true;
    saveError.value = null;
    saveSuccess.value = false;
    try {
      const nextDue = fromInputs();
      const updated = await window.stina.todos.update(props.todo.id, {
        title: editTitle.value,
        description: editDescription.value,
        status: editStatus.value,
        isAllDay: editIsAllDay.value,
        dueAt: nextDue,
        reminderMinutes: nextDue !== null ? editReminderMinutes.value ?? null : null,
        projectId: selectedProjectId.value,
        icon: editIcon.value ?? null,
      });
      if (updated) {
        saveSuccess.value = true;
        setTimeout(() => {
          close();
        }, 600);
      }
    } catch (err) {
      saveError.value = t('todos.update_error');
    } finally {
      saving.value = false;
    }
  }

  onMounted(() => {
    void loadProjects();
  });

  onBeforeUnmount(() => {
    if (iconSearchTimeout) window.clearTimeout(iconSearchTimeout);
  });
</script>

<template>
  <BaseModal
    :open="open"
    :title="t('todos.edit_title', { title: todo.title })"
    :close-label="t('settings.work.cancel')"
    @close="close"
    max-width="520px"
  >
    <div class="form">
      <FormInputText v-model="editTitle" :label="t('todos.title_label')" required />
      <FormTextArea
        v-model="editDescription"
        :label="t('todos.description_label')"
        :rows="3"
      />
      <div class="icon-picker">
        <p class="picker-label">{{ t('todos.icon_label') }}</p>
        <FormInputText
          v-model="iconSearch"
          type="search"
          :placeholder="t('todos.icon_search_placeholder')"
        />
        <div class="icon-grid" role="listbox" :aria-label="t('todos.icon_label')">
          <p v-if="showingIconSearchResults && iconSearchLoading" class="status">
            {{ t('todos.icon_search_loading') }}
          </p>
          <p v-else-if="showingIconSearchResults && iconSearchError" class="status error">
            {{ iconSearchError }}
          </p>
          <p
            v-else-if="showingIconSearchResults && !iconSearchResults.length && !iconSearchLoading"
            class="status"
          >
            {{ t('todos.icon_search_empty') }}
          </p>
          <button
            v-for="option in displayedIcons"
            :key="option.value"
            type="button"
            class="icon-option"
            :class="{ active: option.value === editIcon }"
            :aria-pressed="option.value === editIcon"
            :aria-label="option.value"
            :title="option.value"
            @click="editIcon = option.value"
          >
            <component :is="option.component" aria-hidden="true" />
            <span class="icon-name">{{ option.value }}</span>
          </button>
        </div>
        <small class="hint">{{ t('todos.icon_hint') }}</small>
      </div>
      <FormSelect
        v-model="editStatus"
        :label="t('todos.status_label')"
        :options="statusOptions.map((opt) => ({ value: opt, label: t(`todos.status.${opt}`) }))"
      />
      <div class="inline">
        <FormDate v-model="editDueDate" :label="t('todos.due_label')" />
      <FormTime
        v-if="hasDueTime"
        v-model="editDueTime"
        :label="t('todos.due_label')"
      />
    </div>
    <FormCheckbox v-model="editIsAllDay" :label="t('todos.all_day_label')" />
    <div class="steps">
      <div class="steps-header">
        <span>{{ t('todos.steps_label') }}</span>
        <span v-if="editSteps.length" class="steps-progress">
          {{ t('todos.steps_progress', { done: String(editSteps.filter((s) => s.isDone).length), total: String(editSteps.length) }) }}
        </span>
      </div>
      <div class="add-step">
        <FormInputText
          v-model="newStepTitle"
          :label="t('todos.steps_add_placeholder')"
          @keyup.enter="addStep"
        />
        <SimpleButton type="accent" @click="addStep">+</SimpleButton>
      </div>
      <ul class="steps-list">
        <li
          v-for="step in editSteps"
          :key="step.id"
          class="step"
          draggable="true"
          @dragstart="onDragStart(step.id)"
          @dragover.prevent="onDragOver"
          @drop.prevent="onDrop(step.id)"
        >
          <span class="handle" aria-hidden="true">::</span>
          <input
            class="step-checkbox"
            type="checkbox"
            :checked="step.isDone"
            @change="toggleStepDone(step.id, step.isDone)"
          />
          <input
            class="step-title"
            :value="step.title"
            @change="(e) => updateStepTitle(step.id, (e.target as HTMLInputElement).value)"
          />
          <SimpleButton type="ghost" @click="deleteStep(step.id)">×</SimpleButton>
        </li>
      </ul>
      <p v-if="!editSteps.length" class="steps-empty">{{ t('todos.steps_empty') }}</p>
    </div>
    <FormSelect
      :model-value="editReminderMinutes ?? ''"
      :label="t('todos.reminder_label')"
      :hint="t('todos.reminder_hint')"
      :options="reminderOptions"
      :disabled="!editDueDate"
      @update:model-value="updateReminderMinutes"
    />
    <small class="hint">{{ t('todos.edit_hint') }}</small>
    <FormSelect
      v-model="selectedProjectId"
      :label="t('todos.project_label')"
        :options="[
          { value: null, label: t('todos.project_none') },
          ...projects.map((project) => ({ value: project.id, label: project.name })),
        ]"
      />
      <small v-if="projectsError" class="hint error">{{ projectsError }}</small>
    </div>

    <template #footer>
      <SimpleButton @click="close">
        {{ t('settings.work.cancel') }}
      </SimpleButton>
      <SimpleButton type="accent" @click="clearDue">
        {{ t('todos.clear_due') }}
      </SimpleButton>
      <SimpleButton type="primary" :disabled="saving" @click="saveChanges">
        {{ saving ? t('settings.saving') : t('settings.save') }}
      </SimpleButton>
      <span v-if="saveSuccess" class="status success">{{ t('settings.saved') }}</span>
      <span v-else-if="saveError" class="status error">{{ saveError }}</span>
    </template>
  </BaseModal>
</template>

<style scoped>
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .inline {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    > .hint {
      color: var(--muted);
      font-size: 0.8rem;
      margin: 0;
    }

    > .steps {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      > .steps-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: var(--font-weight-medium);
      }

      > .steps-progress {
        color: var(--muted);
        font-size: 0.85rem;
      }

      > .add-step {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;

        > :deep(.field) {
          flex: 1;
        }
      }

      > .steps-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;

        > .step {
          display: grid;
          grid-template-columns: auto auto 1fr auto;
          gap: 0.4rem;
          align-items: center;
          padding: 0.35rem 0.5rem;
          border: 1px solid var(--border);
          border-radius: var(--border-radius-normal);
          background: var(--window-bg-lower);

          > .handle {
            cursor: grab;
            color: var(--muted);
          }

          > .step-checkbox {
            accent-color: var(--primary);
          }

          > .step-title {
            width: 100%;
            border: 1px solid var(--border);
            border-radius: var(--border-radius-normal);
            padding: 0.35rem 0.5rem;
            background: var(--window-bg);
            color: var(--text);
          }

          > :deep(button) {
            padding: 0.25rem 0.35rem;
          }
        }
      }

      > .steps-empty {
        margin: 0;
        color: var(--muted);
      }
    }

    > .icon-picker {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;

      > .picker-label {
        margin: 0;
        font-weight: 600;
        color: var(--text);
      }

      > .icon-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 0.65rem;

        > .status {
          grid-column: 1 / -1;
          color: var(--muted);
          font-size: 0.9rem;
          margin: 0.25rem 0;

          &.error {
            color: var(--error);
          }
        }

        > .icon-option {
          border: 1px solid var(--border);
          border-radius: 0.75rem;
          height: 78px;
          background: var(--bg-bg);
          color: var(--text);
          cursor: pointer;
          display: inline-flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition:
            border-color 0.12s ease,
            box-shadow 0.12s ease,
            background-color 0.12s ease;

          &:hover {
            border-color: var(--accent);
          }

          &.active {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
            background: color-mix(in srgb, var(--accent) 10%, var(--bg-bg));
          }

          :deep(svg) {
            width: 1.4rem;
            height: 1.4rem;
            color: inherit;
          }

          > .icon-name {
            display: block;
            margin-top: 0.35rem;
            font-size: 0.72rem;
            color: var(--muted);
            text-align: center;
            line-height: 1.1;
            word-break: break-all;
          }
        }
      }
    }
  }

  .status {
    font-size: 0.9rem;
    &.success {
      color: #3cb371;
    }
    &.error {
      color: #c44c4c;
    }
  }
</style>
