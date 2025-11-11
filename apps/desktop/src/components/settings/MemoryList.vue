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
        <div class="memory-content">{{ memory.content }}</div>
        <div class="memory-meta">
          <span class="memory-date">{{ formatDate(memory.createdAt) }}</span>
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
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { MemoryItem } from '@stina/store';
  import { onMounted, onUnmounted, ref } from 'vue';

  const memories = ref<MemoryItem[]>([]);
  const loading = ref(true);
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

  async function handleDelete(id: string) {
    // Note: We need to add a deleteMemory IPC handler for this to work
    // For now, this is a placeholder - memory deletion should be done via AI tool
    void id;
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

  .memory-content {
    font-size: 14px;
    color: var(--text-primary);
    margin-bottom: 8px;
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

  .delete-btn:hover {
    background: var(--error-bg);
    border-color: var(--error-border);
    color: var(--error-text);
  }
</style>
