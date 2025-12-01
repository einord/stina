<script setup lang="ts">
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';
  import Add01Icon from '~icons/hugeicons/add-01';

  import { t } from '@stina/i18n';
  import type { Memory } from '@stina/memories';
  import { onMounted, onUnmounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import IconButton from '../ui/IconButton.vue';

  import EntityList from './EntityList.vue';

  const memories = ref<Memory[]>([]);
  const loading = ref(true);
  const editingId = ref<string | null>(null);
  const editTitle = ref('');
  const editContent = ref('');
  const showModal = ref(false);
  let unsubscribe: (() => void) | null = null;

  onMounted(async () => {
    memories.value = await window.stina.memories.get();
    loading.value = false;

    unsubscribe = window.stina.memories.onChanged((updated: Memory[]) => {
      memories.value = updated;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  function startEdit(memory: Memory | null) {
    editingId.value = memory?.id ?? 'new';
    editTitle.value = memory?.title ?? '';
    editContent.value = memory?.content ?? '';
    showModal.value = true;
  }

  function cancelEdit() {
    editingId.value = null;
    editTitle.value = '';
    editContent.value = '';
    showModal.value = false;
  }

  async function saveEdit(id: string | null) {
    if (!editTitle.value.trim() || !editContent.value.trim()) return;

    if (!id || id === 'new') {
      await window.stina.memories.create({
        title: editTitle.value,
        content: editContent.value,
      });
    } else {
      await window.stina.memories.update(id, {
        title: editTitle.value,
        content: editContent.value,
      });
    }

    cancelEdit();
  }

  async function handleDelete(id: string) {
    if (confirm(t('settings.profile.confirm_delete_memory'))) {
      await window.stina.memories.delete(id);
    }
  }
</script>

<template>
  <SettingsPanel>
    <EntityList
      :title="t('settings.profile.memories_title')"
      :description="t('settings.profile.memories_description')"
      :loading="loading"
      :error="null"
      :empty-text="t('settings.profile.no_memories')"
    >
      <template #actions>
        <SimpleButton
          type="primary"
          @click="startEdit(null)"
          :title="t('settings.profile.add_memory')"
          :aria-label="t('settings.profile.add_memory')"
        >
          <Add01Icon class="add-icon" />
        </SimpleButton>
      </template>
      <template v-for="memory in memories" :key="memory.id">
        <li class="memory-card">
          <div class="view-mode">
            <div class="memory-header">
              <SubFormHeader :title="memory.title" :description="memory.content">
                <IconButton @click="startEdit(memory)" :title="t('settings.profile.memory_toggle')"
                  ><EditIcon
                /></IconButton>
                <IconButton
                  type="danger"
                  @click="handleDelete(memory.id)"
                  :title="t('settings.profile.delete_memory')"
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
        ? t('settings.profile.add_memory')
        : t('settings.profile.edit_memory')
    "
    :close-label="t('settings.profile.cancel_edit')"
    @close="cancelEdit"
  >
    <div class="modal-form">
      <FormInputText
        v-model="editTitle"
        :label="t('settings.profile.memory_title')"
        :placeholder="t('settings.profile.memory_title')"
      />
      <FormTextArea v-model="editContent" :label="t('settings.profile.memory_content')" :rows="3" />
    </div>
    <template #footer>
      <SimpleButton @click="cancelEdit">
        {{ t('settings.profile.cancel_edit') }}
      </SimpleButton>
      <SimpleButton type="primary" @click="saveEdit(editingId)">
        {{ t('settings.profile.save_memory') }}
      </SimpleButton>
    </template>
  </BaseModal>
</template>

<style scoped>
  .memory-card {
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

    > .memory-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;

      > .memory-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
      }

      > .memory-actions {
        display: inline-flex;
        gap: 0.35rem;
      }
    }
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .add-icon {
    width: 1.1rem;
    height: 1.1rem;
  }
</style>
