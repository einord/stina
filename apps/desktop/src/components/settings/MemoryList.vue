<template>
  <SettingsPanel>
    <EntityList
      :title="t('settings.profile.memories_title')"
      :description="t('settings.profile.memories_description')"
      :loading="loading"
      :error="null"
      :empty-text="t('settings.profile.no_memories')"
    >
      <template v-for="memory in memories" :key="memory.id">
        <li class="memory-card">
          <div v-if="editingId === memory.id" class="edit-mode">
            <FormInputText
              v-model="editTitle"
              :label="t('settings.profile.memory_title')"
              :placeholder="t('settings.profile.memory_title')"
            />
            <FormTextArea
              v-model="editContent"
              :label="t('settings.profile.memory_content')"
              :rows="3"
            />
            <div class="actions">
              <SimpleButton type="primary" @click="saveEdit(memory.id)">
                {{ t('settings.profile.save_memory') }}
              </SimpleButton>
              <SimpleButton @click="cancelEdit">
                {{ t('settings.profile.cancel_edit') }}
              </SimpleButton>
            </div>
          </div>
          <div v-else class="view-mode">
            <div class="memory-header">
              <h4 class="memory-title">{{ memory.title }}</h4>
              <div class="memory-actions">
                <SimpleButton @click="startEdit(memory)" :title="t('settings.profile.edit_memory')">
                  <EditIcon />
                </SimpleButton>
                <SimpleButton
                  type="danger"
                  @click="handleDelete(memory.id)"
                  :title="t('settings.profile.delete_memory')"
                >
                  <DeleteIcon />
                </SimpleButton>
              </div>
            </div>
            <p class="memory-content">{{ memory.content }}</p>
            <div class="memory-meta">
              <span class="memory-date">{{ formatDate(memory.createdAt) }}</span>
            </div>
          </div>
        </li>
      </template>
    </EntityList>
  </SettingsPanel>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { Memory } from '@stina/memories';
  import { onMounted, onUnmounted, ref } from 'vue';

  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import SettingsPanel from '../common/SettingsPanel.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import EntityList from './EntityList.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormTextArea from '../form/FormTextArea.vue';

  const memories = ref<Memory[]>([]);
  const loading = ref(true);
  const editingId = ref<string | null>(null);
  const editTitle = ref('');
  const editContent = ref('');
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

  function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function startEdit(memory: Memory) {
    editingId.value = memory.id;
    editTitle.value = memory.title;
    editContent.value = memory.content;
  }

  function cancelEdit() {
    editingId.value = null;
    editTitle.value = '';
    editContent.value = '';
  }

  async function saveEdit(id: string) {
    if (!editTitle.value.trim() || !editContent.value.trim()) {
      return;
    }

    await window.stina.memories.update(id, {
      title: editTitle.value,
      content: editContent.value,
    });

    cancelEdit();
  }

  async function handleDelete(id: string) {
    if (confirm(t('settings.profile.confirm_delete_memory'))) {
      await window.stina.memories.delete(id);
    }
  }
</script>

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

    > .memory-content {
      margin: 0;
      color: var(--text);
      white-space: pre-wrap;
      line-height: 1.5;
    }

    > .memory-meta {
      display: flex;
      justify-content: flex-start;
      color: var(--muted);
      font-size: 0.9rem;
    }
  }

  .edit-mode {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }
  }
</style>
