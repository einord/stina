<script setup lang="ts">
  import Add01Icon from '~icons/hugeicons/add-01';
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import type { Calendar } from '@stina/calendar';
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import IconButton from '../ui/IconButton.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';

  import EntityList from './EntityList.vue';

  const calendars = ref<Calendar[]>([]);
  const loading = ref(true);
  const saving = ref(false);
  const showModal = ref(false);
  const editingId = ref<string | null>(null);
  const editName = ref('');
  const editUrl = ref('');
  const editEnabled = ref(true);
  const notice = ref<{ kind: 'success' | 'error'; message: string } | null>(null);
  const modalError = ref<string | null>(null);

  async function load() {
    loading.value = true;
    try {
      calendars.value = await window.stina.calendar.get();
    } catch {
      calendars.value = [];
    } finally {
      loading.value = false;
    }
  }

  function startEdit(calendar: Calendar | null) {
    editingId.value = calendar?.id ?? 'new';
    editName.value = calendar?.name ?? '';
    editUrl.value = calendar?.url ?? '';
    editEnabled.value = calendar?.enabled ?? true;
    showModal.value = true;
  }

  function cancelEdit() {
    editingId.value = null;
    editName.value = '';
    editUrl.value = '';
    editEnabled.value = true;
    showModal.value = false;
  }

  async function saveEdit(id: string | null) {
    if (!editName.value.trim() || !editUrl.value.trim()) return;
    saving.value = true;
    modalError.value = null;
    try {
      await window.stina.calendar.add({
        name: editName.value.trim(),
        url: editUrl.value.trim(),
        enabled: editEnabled.value,
      });
      await load();
      notice.value = { kind: 'success', message: t('tools.calendar.added') };
      cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tools.calendar.sync_error');
      modalError.value = message;
    } finally {
      saving.value = false;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t('tools.calendar.confirm_delete'))) return;
    saving.value = true;
    try {
      await window.stina.calendar.remove(id);
      await load();
    } catch {
      notice.value = { kind: 'error', message: t('tools.calendar.remove_error') };
    } finally {
      saving.value = false;
    }
  }

  async function toggleEnabled(cal: Calendar) {
    saving.value = true;
    try {
      const next = await window.stina.calendar.setEnabled(cal.id, !cal.enabled);
      if (next) calendars.value = calendars.value.map((c) => (c.id === next.id ? next : c));
    } catch {
      notice.value = { kind: 'error', message: t('tools.calendar.toggle_error') };
    } finally {
      saving.value = false;
    }
  }

  onMounted(() => {
    void load();
  });
</script>

<template>
  <SettingsPanel>
    <EntityList
      :title="t('tools.modules.calendar.title')"
      :description="t('tools.modules.calendar.description')"
      :loading="loading"
      :error="null"
      :empty-text="t('tools.calendar.empty')"
    >
      <template #actions>
        <SimpleButton
          type="primary"
          @click="startEdit(null)"
          :title="t('tools.calendar.add_button')"
          :aria-label="t('tools.calendar.add_button')"
        >
          <Add01Icon class="add-icon" />
        </SimpleButton>
      </template>

      <template v-for="cal in calendars" :key="cal.id">
        <li class="calendar-card">
          <div class="card-left">
            <SubFormHeader
              :title="cal.name"
              :description="cal.url"
            >
              <IconButton @click="startEdit(cal)" :title="t('settings.profile.edit')">
                <EditIcon />
              </IconButton>
              <IconButton type="danger" @click="handleDelete(cal.id)" :title="t('tools.calendar.remove')">
                <DeleteIcon />
              </IconButton>
            </SubFormHeader>
            <div class="meta">
              <span class="badge" :class="{ off: !cal.enabled }">
                {{ cal.enabled ? t('tools.calendar.enabled') : t('tools.calendar.disabled') }}
              </span>
              <span v-if="cal.lastSyncedAt" class="synced">
                {{ t('tools.calendar.last_synced', { date: new Date(cal.lastSyncedAt).toLocaleString() }) }}
              </span>
            </div>
          </div>
          <div class="card-actions">
            <label class="toggle">
              <input type="checkbox" :checked="cal.enabled" @change="toggleEnabled(cal)" />
              <span>{{ cal.enabled ? t('tools.calendar.enabled') : t('tools.calendar.disabled') }}</span>
            </label>
          </div>
        </li>
      </template>
    </EntityList>
  </SettingsPanel>

  <BaseModal
    :open="showModal"
    :title="editingId === 'new' || !editingId ? t('tools.calendar.add_button') : t('settings.profile.edit')"
    :close-label="t('settings.profile.cancel_edit')"
    @close="cancelEdit"
  >
    <div class="modal-form">
      <FormInputText
        v-model="editName"
        :label="t('tools.calendar.name_label')"
        :placeholder="t('tools.calendar.name_placeholder')"
        :disabled="saving"
      />
      <FormInputText
        v-model="editUrl"
        :label="t('tools.calendar.url_label')"
        :placeholder="t('tools.calendar.url_placeholder')"
        :disabled="saving"
      />
      <FormCheckbox v-model="editEnabled" :label="t('tools.calendar.enabled')" :disabled="saving" />
      <p v-if="modalError" class="error">{{ modalError }}</p>
    </div>
    <template #footer>
      <SimpleButton @click="cancelEdit">
        {{ t('settings.profile.cancel_edit') }}
      </SimpleButton>
      <SimpleButton type="primary" @click="saveEdit(editingId)" :disabled="saving">
        {{ saving ? t('settings.profile.save') + '…' : t('settings.profile.save') }}
      </SimpleButton>
    </template>
  </BaseModal>
</template>

<style scoped>
  .calendar-card {
    border: 2px solid var(--border);
    background: var(--bg-bg);
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: center;

    &:first-of-type {
      border-radius: var(--border-radius-normal) var(--border-radius-normal) 0 0;
    }
    &:last-of-type {
      border-radius: 0 0 var(--border-radius-normal) var(--border-radius-normal);
    }
  }

  .card-left {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.9rem;
    color: var(--muted);

    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.2rem 0.7rem;
      background: var(--selected-bg);
      color: var(--text);

      &.off {
        opacity: 0.6;
      }
    }

    .synced {
      font-size: 0.85rem;
    }
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
    font-size: 0.95rem;

    input {
      transform: scale(1.1);
    }
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 0.5rem 0 1rem;

    .error {
      margin: 0;
      color: #b91c1c;
      font-size: 0.9rem;
    }
  }

  .add-icon {
    width: 1.25rem;
    height: 1.25rem;
  }
</style>
