<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Project } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';

  import ProjectForm from './WorkSettings.ProjectForm.vue';

  const projects = ref<Project[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const showEditModal = ref(false);
  const editingProject = ref<Project | null>(null);
  const editName = ref('');
  const editDescription = ref('');
  const disposables: Array<() => void> = [];

  const sortedProjects = computed(() =>
    projects.value.slice().sort((a, b) => a.name.localeCompare(b.name)),
  );

  async function loadProjects() {
    loading.value = true;
    try {
      const list = await window.stina.projects.get();
      projects.value = (list ?? []).map((project) => ({
        ...project,
        description: project.description ?? '',
      }));
      error.value = null;
    } catch (err) {
      error.value = t('settings.work.error');
    } finally {
      loading.value = false;
    }
  }

  function openEditModal(project: Project) {
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

  async function saveEditProject() {
    if (!editingProject.value || !editName.value.trim()) return;
    await window.stina.projects.update(editingProject.value.id, {
      name: editName.value,
      description: editDescription.value || null,
    });
    closeEditModal();
    await loadProjects();
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(t('settings.work.delete_confirm', { name: project.name }));
    if (!confirmed) return;
    await window.stina.projects.delete(project.id);
    await loadProjects();
  }

  onMounted(async () => {
    await loadProjects();
    const off = window.stina.projects.onChanged((items: Project[]) => {
      projects.value = (items ?? []).map((project) => ({
        ...project,
        description: project.description ?? '',
      }));
    });
    disposables.push(off);
  });

  onUnmounted(() => {
    disposables.splice(0).forEach((dispose) => {
      try {
        dispose?.();
      } catch (err) {
        // Ignore dispose errors to avoid breaking unmount cleanup.
        void err;
      }
    });
  });
</script>

<template>
  <SettingsPanel>
    <p v-if="loading" class="status">{{ t('settings.work.loading') }}</p>
    <p v-else-if="error" class="status error">{{ error }}</p>
    <p v-else-if="!sortedProjects.length" class="status">{{ t('settings.work.empty') }}</p>

    <ul v-else class="project-list">
      <li v-for="project in sortedProjects" :key="project.id" class="project-card">
        <div class="project-view">
          <h3>{{ project.name }}</h3>
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
  </SettingsPanel>
</template>

<style scoped>
  .project-list-root {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .status {
      margin: 0;
      color: var(--muted);

      &.error {
        color: #c44c4c;
      }
    }

    > .project-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      > .project-card {
        border: 1px solid var(--border);
        border-radius: var(--border-radius-normal);
        padding: 0.9rem;
        background: var(--window-bg-lower);

        > .project-view {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;

          > .project-description {
            margin: 0;
            color: var(--text);
            white-space: pre-wrap;
          }

          > .actions {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
          }
        }
      }
    }
  }

  @media (max-width: 640px) {
    .project-list-root > .project-list > .project-card > .project-view > .actions {
      width: 100%;
    }
  }
</style>
