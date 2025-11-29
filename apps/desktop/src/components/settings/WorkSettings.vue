<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { ref } from 'vue';

  import BaseModal from '../common/BaseModal.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import FormHeader from '../common/FormHeader.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import ProjectList from './WorkSettings.ProjectList.vue';
  import ProjectForm from './WorkSettings.ProjectForm.vue';
  import TodoSettings from './WorkSettings.TodoSettings.vue';
  import RecurringSettings from './WorkSettings.Recurring.vue';

  const showCreateModal = ref(false);
  const newName = ref('');
  const newDescription = ref('');

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
</script>

<template>
  <div class="work-settings">
    <FormHeader
      :title="t('settings.work.projects')"
      :description="t('settings.work.description')"
    />

    <TodoSettings />
    <RecurringSettings />

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

      <ProjectList />
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
