<script setup lang="ts">
  import Add01Icon from '~icons/hugeicons/add-01';
  import DeleteIcon from '~icons/hugeicons/delete-01';
  import EditIcon from '~icons/hugeicons/edit-01';

  import type { Calendar } from '@stina/calendar';
  import { t } from '@stina/i18n';
  import { onMounted, ref, watch } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormSelect from '../form/FormSelect.vue';
  import IconButton from '../ui/IconButton.vue';

  import EntityList from './EntityList.vue';

  const calendars = ref<Calendar[]>([]);
  const loading = ref(true);
  const saving = ref(false);
  const showModal = ref(false);
  const panelRangeDays = ref<number>(5);
  const hydratingRange = ref(false);
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
      hydratingRange.value = true;
      const calendarSettings = await window.stina.settings.getCalendarSettings?.();
      if (
        calendarSettings &&
        typeof calendarSettings.panelRangeDays === 'number' &&
        Number.isFinite(calendarSettings.panelRangeDays)
      ) {
        panelRangeDays.value = calendarSettings.panelRangeDays;
      }
      hydratingRange.value = false;
    } catch {
      calendars.value = [];
      hydratingRange.value = false;
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
        id: id && id !== 'new' ? id : undefined,
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

  const rangeOptions = [
    { value: 0, label: t('tools.calendar.range_option_today') },
    { value: 1, label: t('tools.calendar.range_option_one') },
    { value: 2, label: t('tools.calendar.range_option_two') },
    { value: 5, label: t('tools.calendar.range_option_five') },
    { value: 7, label: t('tools.calendar.range_option_seven') },
    { value: 14, label: t('tools.calendar.range_option_fourteen') },
  ];

  async function updateRange(value: number | string | null) {
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (parsed === null || Number.isNaN(parsed)) return;
    const clamped = Math.max(0, parsed);
    panelRangeDays.value = clamped;
    try {
      await window.stina.settings.updateCalendarSettings({ panelRangeDays: clamped });
      window.dispatchEvent(
        new CustomEvent('stina:calendar-range-changed', { detail: { days: clamped } }),
      );
    } catch {
      notice.value = { kind: 'error', message: t('tools.calendar.range_save_error') };
    }
  }

  watch(
    () => panelRangeDays.value,
    (val) => {
      if (hydratingRange.value) return;
      void updateRange(val);
    },
  );
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
        <div class="actions-row">
          <SimpleButton
            type="primary"
            @click="startEdit(null)"
            :title="t('tools.calendar.add_button')"
            :aria-label="t('tools.calendar.add_button')"
          >
            <Add01Icon class="add-icon" />
          </SimpleButton>
        </div>
      </template>

      <FormSelect
        class="future-days"
        v-model="panelRangeDays"
        :label="t('tools.calendar.range_label')"
        :hint="t('tools.calendar.range_hint')"
        :options="rangeOptions"
      />

      <template v-for="cal in calendars" :key="cal.id">
        <li class="calendar-card">
          <div class="card-left">
            <SubFormHeader :title="cal.name" :description="cal.url">
              <IconButton @click="toggleEnabled(cal)" :title="t('tools.calendar.toggle_enabled')">
                <input type="checkbox" :checked="cal.enabled" @change="toggleEnabled(cal)" />
              </IconButton>
              <IconButton @click="startEdit(cal)" :title="t('settings.profile.edit')">
                <EditIcon />
              </IconButton>
              <IconButton
                type="danger"
                @click="handleDelete(cal.id)"
                :title="t('tools.calendar.remove')"
              >
                <DeleteIcon />
              </IconButton>
            </SubFormHeader>
            <div class="meta">
              <span class="badge" :class="{ off: !cal.enabled }">
                {{ cal.enabled ? t('tools.calendar.enabled') : t('tools.calendar.disabled') }}
              </span>
              <span v-if="cal.lastSyncedAt" class="synced">
                {{
                  t('tools.calendar.last_synced', {
                    date: new Date(cal.lastSyncedAt).toLocaleString(),
                  })
                }}
              </span>
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
        ? t('tools.calendar.add_button')
        : t('settings.profile.edit')
    "
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
    overflow: hidden;
    width: 100%;

    &:first-of-type {
      border-radius: var(--border-radius-normal) var(--border-radius-normal) 0 0;
    }
    &:last-of-type {
      border-radius: 0 0 var(--border-radius-normal) var(--border-radius-normal);
    }
  }

  .actions-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .future-days {
    margin-bottom: 1rem;
  }

  .meta {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.9rem;
    color: var(--muted);
    margin-top: 0.5rem;

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
