<script setup lang="ts">
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import type { Project } from '@stina/todos';
  import { computed, onMounted, onUnmounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import IconButton from '../ui/IconButton.vue';

  import ProjectForm from './WorkSettings.ProjectForm.vue';

  const projects = ref<Project[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const showEditModal = ref(false);
  const editingProject = ref<Project | null>(null);
  const editName = ref('');
  const editDescription = ref('');
  const disposables: Array<() => void> = [];
  const showCreateModal = ref(false);

  const newName = ref('');
  const newDescription = ref('');

  const sortedProjects = computed(() =>
    projects.value.slice().sort((a, b) => a.name.localeCompare(b.name)),
  );

  function openCreateModal() {
    showCreateModal.value = true;
  }

  function closeCreateModal() {
    showCreateModal.value = false;
    newName.value = '';
    newDescription.value = '';
  }

  async function createProject() {
    if (!newName.value.trim()) return;
    await window.stina.projects.create({
      name: newName.value,
      description: newDescription.value || undefined,
    });
    closeCreateModal();
  }

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
  <p v-if="loading" class="status">{{ t('settings.work.loading') }}</p>
  <p v-else-if="error" class="status error">{{ error }}</p>
  <p v-else-if="!sortedProjects.length" class="status">{{ t('settings.work.empty') }}</p>

  <EntityList
    v-else
    :title="t('settings.work.projects')"
    :description="[t('settings.work.description'), t('settings.work.projects_hint')]"
    :empty-text="t('settings.work.no_projects')"
  >
    <template #actions>
      <SimpleButton @click="openCreateModal" type="primary">
        {{ t('settings.work.add_button') }}
      </SimpleButton>
    </template>

    <li v-for="project in sortedProjects" :key="project.id" class="project-card">
      <div class="project">
        <SubFormHeader
          :title="project.name"
          :description="project.description || t('settings.work.no_description')"
        >
          <IconButton @click="openEditModal(project)">
            <EditIcon />
          </IconButton>
          <IconButton @click="deleteProject(project)" type="danger"> <DeleteIcon /> </IconButton
        ></SubFormHeader>
      </div>
    </li>
  </EntityList>

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
</template>

<style scoped>
  .project {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .actions {
      display: flex;
      gap: 1rem;
    }
  }
</style>
