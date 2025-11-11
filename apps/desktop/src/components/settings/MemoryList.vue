<template>
  <div class="memory-list">
    <h3 class="section-title">{{ t('settings.profile.memories_title') }}</h3>
    <p class="section-description">{{ t('settings.profile.memories_description') }}</p>

    <div v-if="loading" class="loading">{{ t('settings.profile.loading_memories') }}</div>
    <div v-else-if="memories.length === 0" class="empty">
      {{ t('settings.profile.no_memories') }}
    </div>
    <div v-else class="memories">
      <div v-for="memory in memories" :key="memory.id" class="memory-item">
        <div v-if="editingId === memory.id" class="edit-mode">
          <input
            v-model="editTitle"
            class="edit-title"
            :placeholder="t('settings.profile.memory_title')"
          />
          <textarea
            v-model="editContent"
            class="edit-content"
            :placeholder="t('settings.profile.memory_content')"
            rows="3"
          ></textarea>
          <div class="edit-actions">
            <button class="save-btn" @click="saveEdit(memory.id)">
              {{ t('settings.profile.save_memory') }}
            </button>
            <button class="cancel-btn" @click="cancelEdit">
              {{ t('settings.profile.cancel_edit') }}
            </button>
          </div>
        </div>
        <div v-else class="view-mode">
          <div class="memory-title">{{ memory.title }}</div>
          <div class="memory-content">{{ memory.content }}</div>
          <div class="memory-meta">
            <span class="memory-date">{{ formatDate(memory.createdAt) }}</span>
            <div class="memory-actions">
              <button
                class="edit-btn"
                @click="startEdit(memory)"
                :title="t('settings.profile.edit_memory')"
              >
                ✎
              </button>
              <button
                class="delete-btn"
                @click="handleDelete(memory.id)"
                :title="t('settings.profile.delete_memory')"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { MemoryItem } from '@stina/store';
  import { onMounted, onUnmounted, ref } from 'vue';

  const memories = ref<MemoryItem[]>([]);
  const loading = ref(true);
  const editingId = ref<string | null>(null);
  const editTitle = ref('');
  const editContent = ref('');
  let unsubscribe: (() => void) | null = null;

  onMounted(async () => {
    memories.value = await window.stina.memories.get();
    loading.value = false;

    unsubscribe = window.stina.memories.onChanged((updated: MemoryItem[]) => {
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

  function startEdit(memory: MemoryItem) {
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
  .memory-list {
    margin-top: 32px;
    padding-top: 32px;
    border-top: 1px solid var(--border-color);
  }

  .section-title {
    margin: 0 0 8px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .section-description {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .loading,
  .empty {
    padding: 20px;
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border-radius: 8px;
  }

  .memories {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .memory-item {
    padding: 12px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    transition: border-color 0.2s;
  }

  .memory-item:hover {
    border-color: var(--border-hover);
  }

  .memory-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .memory-content {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .memory-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .memory-date {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  .memory-actions {
    display: flex;
    gap: 8px;
  }

  .edit-btn,
  .delete-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s;
  }

  .edit-btn:hover {
    background: var(--bg-hover);
    border-color: var(--primary);
    color: var(--primary);
  }

  .delete-btn:hover {
    background: var(--error-bg);
    border-color: var(--error-border);
    color: var(--error-text);
  }

  /* Edit mode styles */
  .edit-mode {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .edit-title,
  .edit-content {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    color: var(--text-primary);
    transition: border-color 0.2s;
  }

  .edit-title {
    font-weight: 600;
  }

  .edit-title:focus,
  .edit-content:focus {
    outline: none;
    border-color: var(--primary);
  }

  .edit-content {
    resize: vertical;
    min-height: 60px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .save-btn,
  .cancel-btn {
    padding: 6px 16px;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .save-btn {
    background: var(--primary);
    border: 1px solid var(--primary);
    color: white;
  }

  .save-btn:hover {
    opacity: 0.9;
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
  }
</style>
