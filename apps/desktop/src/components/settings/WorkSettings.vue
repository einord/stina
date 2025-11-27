<script setup lang="ts">
  import { formatRelativeTime, t } from '@stina/i18n';
  import type { Project } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import BaseModal from '../common/BaseModal.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import FormHeader from '../common/FormHeader.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import ProjectForm from './WorkSettings.ProjectForm.vue';

  type EditableProject = Project & {
    isEditing?: boolean;
    draftName: string;
    draftDescription: string;
  };

  const projects = ref<EditableProject[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const showCreateModal = ref(false);
  const showEditModal = ref(false);
  const editingProject = ref<EditableProject | null>(null);
  const newName = ref('');
  const newDescription = ref('');
  const editName = ref('');
  const editDescription = ref('');
  const disposables: Array<() => void> = [];

  const sortedProjects = computed(() =>
    projects.value.slice().sort((a, b) => a.name.localeCompare(b.name)),
  );

  const locale = typeof navigator !== 'undefined' ? navigator.language : 'sv-SE';

  function relativeTime(ts: number) {
    return formatRelativeTime(ts, { t, absoluteFormatter: new Intl.DateTimeFormat(locale) });
  }

  function shapeProjects(list: Project[]): EditableProject[] {
    return list.map((project) => ({
      ...project,
      draftName: project.name,
      draftDescription: project.description ?? '',
      isEditing: false,
    }));
  }

  async function loadProjects() {
    loading.value = true;
    try {
      const list = await window.stina.projects.get();
      projects.value = shapeProjects(list ?? []);
      error.value = null;
    } catch (err) {
      error.value = t('settings.work.error');
      console.error('[settings] Failed to load projects', err);
    } finally {
      loading.value = false;
    }
  }

  function openCreateModal() {
    showCreateModal.value = true;
  }

  function closeCreateModal() {
    showCreateModal.value = false;
    newName.value = '';
    newDescription.value = '';
  }

  function openEditModal(project: EditableProject) {
    editingProject.value = project;
    editName.value = project.name;
    editDescription.value = project.description ?? '';
    showEditModal.value = true;
  }

  function closeEditModal() {
    showEditModal.value = false;
    editingProject.value = null;
    editName.value = '';
    editDescription.value = '';
  }

  async function createProject() {
    if (!newName.value.trim()) return;
    await window.stina.projects.create({
      name: newName.value,
      description: newDescription.value || undefined,
    });
    closeCreateModal();
    await loadProjects();
  }

  async function saveEditProject() {
    if (!editingProject.value || !editName.value.trim()) return;
    await window.stina.projects.update(editingProject.value.id, {
      name: editName.value,
      description: editDescription.value || null,
    });
    closeEditModal();
    await loadProjects();
  }

  async function deleteProject(project: EditableProject) {
    const confirmed = window.confirm(t('settings.work.delete_confirm', { name: project.name }));
    if (!confirmed) return;
    await window.stina.projects.delete(project.id);
    await loadProjects();
  }

  onMounted(async () => {
    await loadProjects();
    const off = window.stina.projects.onChanged((items: Project[]) => {
      projects.value = shapeProjects(items ?? []);
    });
    disposables.push(off);
  });

  onUnmounted(() => {
    disposables.splice(0).forEach((dispose) => {
      try {
        dispose?.();
      } catch (err) {
        console.error('[settings] Failed to dispose project listener', err);
      }
    });
  });
</script>

<template>
  <div class="work-settings">
    <FormHeader
      :title="t('settings.work.projects')"
      :description="t('settings.work.description')"
    />

    <section class="panel">
      <div class="header">
        <SubFormHeader
          :title="t('settings.work.projects_list_title')"
          :description="t('settings.work.projects_hint')"
        />
        <SimpleButton @click="openCreateModal" type="primary">
          {{ t('settings.work.add_button') }}
        </SimpleButton>
      </div>

      <p v-if="loading" class="status">{{ t('settings.work.loading') }}</p>
      <p v-else-if="error" class="status error">{{ error }}</p>
      <p v-else-if="!sortedProjects.length" class="status">{{ t('settings.work.empty') }}</p>

      <ul v-else class="project-list">
        <li v-for="project in sortedProjects" :key="project.id" class="project-card">
          <div class="project-view">
            <div class="project-heading">
              <div>
                <h4>{{ project.name }}</h4>
                <p class="meta">
                  {{ t('settings.work.updated_at', { date: relativeTime(project.updatedAt) }) }}
                </p>
              </div>
              <span class="pill" v-if="project.description">
                {{ t('settings.work.with_description') }}
              </span>
            </div>
            <p class="project-description">
              {{ project.description || t('settings.work.no_description') }}
            </p>
            <div class="actions">
              <SimpleButton @click="openEditModal(project)">
                {{ t('settings.work.edit') }}
              </SimpleButton>
              <SimpleButton @click="deleteProject(project)" type="danger">
                {{ t('settings.work.delete') }}
              </SimpleButton>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <BaseModal
      :open="showCreateModal"
      :title="t('settings.work.add_title')"
      :close-label="t('settings.work.cancel')"
      @close="closeCreateModal"
    >
      <ProjectForm
        :name="newName"
        :description="newDescription"
        @update:name="newName = $event"
        @update:description="newDescription = $event"
      >
        <template #footer>
          <SimpleButton @click="closeCreateModal">
            {{ t('settings.work.cancel') }}
          </SimpleButton>
          <SimpleButton type="primary" :disabled="!newName.trim()" @click="createProject">
            {{ t('settings.work.add_button') }}
          </SimpleButton>
        </template>
      </ProjectForm>
    </BaseModal>

    <BaseModal
      :open="showEditModal"
      :title="t('settings.work.edit')"
      :close-label="t('settings.work.cancel')"
      @close="closeEditModal"
    >
      <ProjectForm
        :name="editName"
        :description="editDescription"
        @update:name="editName = $event"
        @update:description="editDescription = $event"
      >
        <template #footer>
          <SimpleButton @click="closeEditModal">
            {{ t('settings.work.cancel') }}
          </SimpleButton>
          <SimpleButton type="primary" :disabled="!editName.trim()" @click="saveEditProject">
            {{ t('settings.work.save') }}
          </SimpleButton>
        </template>
      </ProjectForm>
    </BaseModal>
  </div>
</template>

<style scoped>
  .work-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 1rem;
    }
  }

  .pill {
    background: var(--window-bg-lower);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.3rem 0.75rem;
    font-size: 0.85rem;
    color: var(--muted);
  }

  .status {
    margin: 0;
    color: var(--muted);
  }

  .status.error {
    color: #c44c4c;
  }

  .project-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .project-card {
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.9rem;
    background: var(--window-bg-lower);
  }

  .project-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }

  .project-description {
    margin: 0.5rem 0 0.75rem 0;
    color: var(--text);
    white-space: pre-wrap;
  }

  .meta {
    margin: 0;
    color: var(--muted);
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  @media (max-width: 640px) {
    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions {
      width: 100%;
    }
  }
</style>
