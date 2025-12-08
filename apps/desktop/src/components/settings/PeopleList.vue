<script setup lang="ts">
  import Add01Icon from '~icons/hugeicons/add-01';
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import { t } from '@stina/i18n';
  import type { Person } from '@stina/people';
  import { onMounted, onUnmounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import IconButton from '../ui/IconButton.vue';

  import EntityList from './EntityList.vue';

  const people = ref<Person[]>([]);
  const loading = ref(true);
  const editingId = ref<string | null>(null);
  const editName = ref('');
  const editDescription = ref('');
  const showModal = ref(false);
  let unsubscribe: (() => void) | null = null;

  onMounted(async () => {
    people.value = await window.stina.people.get();
    loading.value = false;
    unsubscribe = window.stina.people.onChanged((updated: Person[]) => {
      people.value = updated;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  function startEdit(person: Person | null) {
    editingId.value = person?.id ?? 'new';
    editName.value = person?.name ?? '';
    editDescription.value = person?.description ?? '';
    showModal.value = true;
  }

  function cancelEdit() {
    editingId.value = null;
    editName.value = '';
    editDescription.value = '';
    showModal.value = false;
  }

  async function saveEdit(id: string | null) {
    if (!editName.value.trim()) return;
    if (id && id !== 'new') {
      // Use update for existing people to avoid name collision
      await window.stina.people.update(id, {
        name: editName.value.trim(),
        description: editDescription.value.trim() || null,
      });
    } else {
      // Use upsert for new people
      await window.stina.people.upsert({
        name: editName.value.trim(),
        description: editDescription.value.trim() || null,
      });
    }
    cancelEdit();
  }

  async function handleDelete(id: string) {
    if (confirm(t('tools.modules.people.confirm_delete'))) {
      await window.stina.people.delete(id);
    }
  }
</script>

<template>
  <SettingsPanel>
    <EntityList
      :title="t('tools.modules.people.list_title')"
      :description="t('tools.modules.people.list_description')"
      :loading="loading"
      :error="null"
      :empty-text="t('tools.modules.people.empty')"
    >
      <template #actions>
        <SimpleButton
          type="primary"
          @click="startEdit(null)"
          :title="t('tools.modules.people.add_button')"
          :aria-label="t('tools.modules.people.add_button')"
        >
          <Add01Icon class="add-icon" />
        </SimpleButton>
      </template>
      <template v-for="person in people" :key="person.id">
        <li class="person-card">
          <div class="view-mode">
            <div class="person-header">
              <SubFormHeader
                :title="person.name"
                :description="person.description || t('tools.modules.people.no_description')"
              >
                <IconButton @click="startEdit(person)" :title="t('tools.modules.people.edit')">
                  <EditIcon />
                </IconButton>
                <IconButton
                  type="danger"
                  @click="handleDelete(person.id)"
                  :title="t('tools.modules.people.delete')"
                >
                  <DeleteIcon />
                </IconButton>
              </SubFormHeader>
            </div>
          </div>
        </li>
      </template>
    </EntityList>
  </SettingsPanel>

  <BaseModal
    :open="showModal"
    :title="
      editingId === 'new' || !editingId
        ? t('tools.modules.people.add_button')
        : t('tools.modules.people.edit_person')
    "
    :close-label="t('settings.profile.cancel_edit')"
    @close="cancelEdit"
  >
    <div class="modal-form">
      <FormInputText
        v-model="editName"
        :label="t('tools.modules.people.name_label')"
        :placeholder="t('tools.modules.people.name_placeholder')"
      />
      <FormTextArea
        v-model="editDescription"
        :label="t('tools.modules.people.description_label')"
        :placeholder="t('tools.modules.people.description_placeholder')"
        :rows="3"
      />
    </div>
    <template #footer>
      <SimpleButton @click="cancelEdit">
        {{ t('settings.profile.cancel_edit') }}
      </SimpleButton>
      <SimpleButton type="primary" @click="saveEdit(editingId)">
        {{ t('settings.profile.save') }}
      </SimpleButton>
    </template>
  </BaseModal>
</template>

<style scoped>
  .person-card {
    border: 2px solid var(--border);
    background: var(--bg-bg);
    padding: 1rem;
    transition: border-color 0.15s ease;

    &:first-of-type {
      border-radius: var(--border-radius-normal) var(--border-radius-normal) 0 0;
    }
    &:last-of-type {
      border-radius: 0 0 var(--border-radius-normal) var(--border-radius-normal);
    }
  }

  .view-mode {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;

    > .person-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0.5rem 0 1rem;
  }

  .add-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
</style>
