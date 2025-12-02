<script setup lang="ts">
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';
  import Add01Icon from '~icons/hugeicons/add-01';
  import HourglassIcon from '~icons/hugeicons/hourglass';

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
  const editTemporary = ref(false);
  const editValidUntil = ref('');
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
    editTemporary.value = Boolean(memory?.validUntil);
    editValidUntil.value = memory?.validUntil
      ? toInputDateTime(memory.validUntil)
      : editTemporary.value
        ? defaultEndOfDayInput()
        : '';
    showModal.value = true;
  }

  function cancelEdit() {
    editingId.value = null;
    editTitle.value = '';
    editContent.value = '';
    editTemporary.value = false;
    editValidUntil.value = '';
    showModal.value = false;
  }

  async function saveEdit(id: string | null) {
    if (!editTitle.value.trim() || !editContent.value.trim()) return;

    const nextValidUntil =
      editTemporary.value && editValidUntil.value
        ? parseDateTime(editValidUntil.value)
        : editTemporary.value
          ? endOfToday()
          : null;

    if (!id || id === 'new') {
      const tags: string[] = [];
      if (editTemporary.value) tags.push('ephemeral', 'day-note');
      await window.stina.memories.create({
        title: editTitle.value,
        content: editContent.value,
        validUntil: nextValidUntil ?? undefined,
        tags: tags.length ? tags : undefined,
      });
    } else {
      const existing = memories.value.find((m) => m.id === id);
      const existingTags = existing?.tags ?? [];
      const tags = editTemporary.value
        ? Array.from(new Set([...existingTags, 'ephemeral', 'day-note']))
        : existingTags.filter((t) => t !== 'ephemeral' && t !== 'day-note');
      await window.stina.memories.update(id, {
        title: editTitle.value,
        content: editContent.value,
        validUntil: editTemporary.value ? nextValidUntil ?? endOfToday() : null,
        tags: tags.length ? tags : [],
      });
    }

    cancelEdit();
  }

  async function handleDelete(id: string) {
    if (confirm(t('settings.profile.confirm_delete_memory'))) {
      await window.stina.memories.delete(id);
    }
  }

  function toInputDateTime(ts: number) {
    const d = new Date(ts);
    const iso = d.toISOString();
    return iso.slice(0, 16);
  }

  function parseDateTime(value: string): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function endOfToday(): number {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.getTime();
  }

  function defaultEndOfDayInput(): string {
    return toInputDateTime(endOfToday());
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
                <IconButton
                  v-if="memory.validUntil"
                  class="badge-icon"
                  :title="t('settings.profile.memory_temporary_badge', { date: new Date(memory.validUntil).toLocaleString() })"
                  disabled
                >
                  <HourglassIcon />
                </IconButton>
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
      <label class="inline-field">
        <FormCheckbox v-model="editTemporary" :label="t('settings.profile.memory_temporary_label')" />
        <FormInputText
          v-model="editValidUntil"
          type="datetime-local"
          :label="t('settings.profile.memory_valid_until_label')"
          :placeholder="t('settings.profile.memory_valid_until_placeholder')"
          :disabled="!editTemporary"
        />
      </label>
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

  .inline-field {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
    align-items: flex-end;
  }

  .badge-icon {
    opacity: 0.85;

    :deep(svg) {
      width: 1.1rem;
      height: 1.1rem;
    }
  }
</style>
