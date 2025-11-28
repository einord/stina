<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { useDebounceFn } from '@vueuse/core';
  import { onMounted, ref } from 'vue';

  import SubFormHeader from '../common/SubFormHeader.vue';

  const defaultReminder = ref<number | null>(null);
  const allDayTime = ref<string>('09:00');
  const saving = ref(false);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const success = ref(false);

  function parseReminderInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isValidTimeFormat(value: string): boolean {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return timeRegex.test(value);
  }

  async function loadSettings() {
    loading.value = true;
    try {
      const settings = await window.stina.settings.getTodoSettings();
      defaultReminder.value =
        settings?.defaultReminderMinutes === undefined ? null : settings.defaultReminderMinutes;
      allDayTime.value = settings?.allDayReminderTime || '09:00';
      error.value = null;
    } catch {
      error.value = t('settings.work.todos_load_error');
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void loadSettings();
  });

  async function saveSettings() {
    saving.value = true;
    success.value = false;
    if (allDayTime.value && !isValidTimeFormat(allDayTime.value)) {
      error.value = t('settings.work.invalid_time_format');
      saving.value = false;
      return;
    }
    try {
      await window.stina.settings.updateTodoSettings({
        defaultReminderMinutes: defaultReminder.value,
        allDayReminderTime: allDayTime.value || null,
      });
      success.value = true;
      error.value = null;
    } catch {
      error.value = t('settings.work.todos_save_error');
      success.value = false;
    } finally {
      saving.value = false;
    }
  }

  const debouncedSave = useDebounceFn(saveSettings, 400);
</script>

<template>
  <section class="panel">
    <div class="header">
      <SubFormHeader
        :title="t('settings.work.todos_header')"
        :description="t('settings.work.todos_description')"
      />
    </div>

    <div class="form-grid">
      <label class="field">
        <span>{{ t('settings.work.default_reminder_label') }}</span>
        <select
          :value="defaultReminder ?? ''"
          @change="
            defaultReminder = parseReminderInput(($event.target as HTMLSelectElement).value);
            debouncedSave();
          "
        >
          <option value="">{{ t('settings.work.reminder_none') }}</option>
          <option v-for="opt in [0, 5, 15, 30, 60]" :key="opt" :value="opt">
            {{
              opt === 0
                ? t('settings.work.reminder_at_time')
                : t('settings.work.reminder_minutes', { minutes: String(opt) })
            }}
          </option>
        </select>
        <small class="hint">{{ t('settings.work.default_reminder_hint') }}</small>
      </label>

      <label class="field">
        <span>{{ t('settings.work.all_day_time_label') }}</span>
        <input
          v-model="allDayTime"
          type="time"
          step="60"
          @change="debouncedSave"
          @blur="debouncedSave"
        />
        <small class="hint">{{ t('settings.work.all_day_time_hint') }}</small>
      </label>
    </div>
    <div class="status-row">
      <span v-if="loading" class="status muted">{{ t('settings.loading') }}</span>
      <span v-else-if="error" class="status error">{{ error }}</span>
      <span v-else-if="saving" class="status muted">{{ t('settings.saving') }}</span>
    </div>
  </section>
</template>

<style scoped>
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

    > .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 0.75rem;

      > .field {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        font-size: 0.95rem;
        color: var(--text);

        > select,
        > input {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: var(--border-radius-normal);
          padding: 0.65rem 0.75rem;
          background: var(--window-bg-lower);
          color: var(--text);
        }

        > .hint {
          margin: 0;
          color: var(--muted);
          font-size: 0.8rem;
        }
      }
    }

    > .status-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;

      > .status {
        font-size: 0.9rem;

        &.muted {
          color: var(--muted);
        }
        &.error {
          color: #c44c4c;
        }
        &.success {
          color: #3cb371;
        }
      }
    }
  }
</style>
