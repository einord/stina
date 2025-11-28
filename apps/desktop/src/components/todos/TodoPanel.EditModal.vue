<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Project, Todo, TodoStatus } from '@stina/todos';
  import { computed, onMounted, ref, watch } from 'vue';

  import BaseModal from '../common/BaseModal.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';

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
  const projects = ref<Project[]>([]);
  const selectedProjectId = ref<string | null>(null);
  const projectsError = ref<string | null>(null);
  const editTitle = ref('');
  const editDescription = ref('');

  const statusOptions: TodoStatus[] = ['not_started', 'in_progress', 'completed', 'cancelled'];

  function pad(num: number) {
    return String(num).padStart(2, '0');
  }

  const hasDueTime = computed(() => !editIsAllDay.value);

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
    if (editIsAllDay.value) {
      return new Date(`${editDueDate.value}T00:00:00`).getTime();
    }
    const time = editDueTime.value || '00:00';
    return new Date(`${editDueDate.value}T${time}`).getTime();
  }

  function resetForm() {
    editStatus.value = props.todo.status;
    editTitle.value = props.todo.title ?? '';
    editDescription.value = props.todo.description ?? '';
    editIsAllDay.value = !!props.todo.isAllDay;
    editDueDate.value = toDateInput(props.todo.dueAt);
    editDueTime.value = toTimeInput(props.todo.dueAt);
    selectedProjectId.value = props.todo.projectId ?? null;
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
  }

  async function loadProjects() {
    try {
      projects.value = (await window.stina.projects.get()) ?? [];
      projectsError.value = null;
    } catch (err) {
      projectsError.value = t('settings.work.error');
    }
  }

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
        projectId: selectedProjectId.value,
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
      <label class="field">
        <span>{{ t('todos.title_label') }}</span>
        <input v-model="editTitle" type="text" />
      </label>
      <label class="field">
        <span>{{ t('todos.description_label') }}</span>
        <textarea v-model="editDescription" rows="3" />
      </label>
      <label class="field">
        <span>{{ t('todos.status_label') }}</span>
        <select v-model="editStatus">
          <option v-for="opt in statusOptions" :key="opt" :value="opt">
            {{ t(`todos.status.${opt}`) }}
          </option>
        </select>
      </label>
      <label class="field inline">
        <span>{{ t('todos.all_day_label') }}</span>
        <input type="checkbox" v-model="editIsAllDay" />
      </label>
      <label class="field">
        <span>{{ t('todos.due_label') }}</span>
        <div class="due-inputs">
          <input v-model="editDueDate" type="date" />
          <input v-if="hasDueTime" v-model="editDueTime" type="time" />
        </div>
        <small class="hint">{{ t('todos.edit_hint') }}</small>
      </label>
      <label class="field">
        <span>{{ t('todos.project_label') }}</span>
        <select v-model="selectedProjectId">
          <option :value="null">{{ t('todos.project_none') }}</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
        <small v-if="projectsError" class="hint error">{{ projectsError }}</small>
      </label>
    </div>

    <template #footer>
      <SimpleButton @click="close">
        {{ t('settings.work.cancel') }}
      </SimpleButton>
      <SimpleButton type="accent" @click="() => { editDueDate = ''; editDueTime = ''; }">
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
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.95rem;
    color: var(--text);

    &.inline {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }

    > select,
    > .due-inputs > input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--border-radius-normal);
      padding: 0.65rem 0.75rem;
      background: var(--window-bg-lower);
      color: var(--text);
    }

    > .due-inputs {
      display: flex;
      gap: 0.5rem;
    }

    > .hint {
      color: var(--muted);
      font-size: 0.8rem;
      margin: 0;
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
