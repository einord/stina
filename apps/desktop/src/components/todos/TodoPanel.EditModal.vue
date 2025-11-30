<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Project, Todo, TodoStatus } from '@stina/todos';
  import { computed, onMounted, ref, watch } from 'vue';

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
      <FormInputText v-model="editTitle" :label="t('todos.title_label')" required />
      <FormTextArea
        v-model="editDescription"
        :label="t('todos.description_label')"
        :rows="3"
      />
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
