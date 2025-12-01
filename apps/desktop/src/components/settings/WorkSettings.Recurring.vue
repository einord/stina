<script setup lang="ts">
  import { t } from '@stina/i18n';
  import type { RecurringTemplate } from '@stina/todos';
  import {
    type ComponentPublicInstance,
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch,
  } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import BaseModal from '../common/BaseModal.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import FormInputText from '../form/FormInputText.vue';
  import FormSelect from '../form/FormSelect.vue';
  import FormTextArea from '../form/FormTextArea.vue';
  import FormTime from '../form/FormTime.vue';

  const props = defineProps<{
    targetTemplateId?: string | null;
  }>();

  const templates = ref<RecurringTemplate[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const showModal = ref(false);
  const editing = ref<RecurringTemplate | null>(null);
  const disposers: Array<() => void> = [];
  const templateRefs = new Map<string, HTMLElement>();
  const highlightedId = ref<string | null>(null);
  const pendingTargetId = ref<string | null>(null);
  const handledTargets = new Set<string>();
  const emit = defineEmits<{
    'target-consumed': [];
  }>();

  const form = reactive({
    title: '',
    description: '',
    frequency: 'weekly' as RecurringTemplate['frequency'],
    daysOfWeek: [new Date().getDay()] as number[],
    dayOfMonth: 1 as number | null,
    months: [] as number[],
    monthOfYear: 1 as number,
    timeOfDay: '09:00' as string | null,
    isAllDay: false,
    leadTimeValue: 0,
    leadTimeUnit: 'days' as RecurringTemplate['leadTimeUnit'],
    reminderMinutes: null as number | null,
    overlapPolicy: 'skip_if_open' as RecurringTemplate['overlapPolicy'],
    enabled: true,
    projectId: null as string | null,
  });

  const frequencyOptions = computed(() => [
    { value: 'weekly', label: t('settings.work.recurring_frequency_weekly') },
    { value: 'monthly', label: t('settings.work.recurring_frequency_monthly') },
    { value: 'yearly', label: t('settings.work.recurring_frequency_yearly') },
  ]);

  const overlapOptions = computed(() => [
    { value: 'skip_if_open', label: t('settings.work.recurring_overlap_skip') },
    { value: 'allow_multiple', label: t('settings.work.recurring_overlap_allow') },
    { value: 'replace_open', label: t('settings.work.recurring_overlap_replace') },
  ]);

  const weekdayOptions = computed(() => [
    { value: 1, label: t('settings.work.day_names.mon') },
    { value: 2, label: t('settings.work.day_names.tue') },
    { value: 3, label: t('settings.work.day_names.wed') },
    { value: 4, label: t('settings.work.day_names.thu') },
    { value: 5, label: t('settings.work.day_names.fri') },
    { value: 6, label: t('settings.work.day_names.sat') },
    { value: 0, label: t('settings.work.day_names.sun') },
  ]);

  const monthOptions = computed(() => [
    { value: 1, label: t('settings.work.month_names.jan') },
    { value: 2, label: t('settings.work.month_names.feb') },
    { value: 3, label: t('settings.work.month_names.mar') },
    { value: 4, label: t('settings.work.month_names.apr') },
    { value: 5, label: t('settings.work.month_names.may') },
    { value: 6, label: t('settings.work.month_names.jun') },
    { value: 7, label: t('settings.work.month_names.jul') },
    { value: 8, label: t('settings.work.month_names.aug') },
    { value: 9, label: t('settings.work.month_names.sep') },
    { value: 10, label: t('settings.work.month_names.oct') },
    { value: 11, label: t('settings.work.month_names.nov') },
    { value: 12, label: t('settings.work.month_names.dec') },
  ]);

  const leadTimeUnitOptions = computed(() => [
    { value: 'hours', label: t('settings.work.recurring_lead_unit_hours') },
    { value: 'days', label: t('settings.work.recurring_lead_unit_days') },
    { value: 'after_completion', label: t('settings.work.recurring_lead_unit_after_completion') },
  ]);

  const reminderOptions = computed(() => [
    { value: '', label: t('settings.work.reminder_none') },
    ...[0, 5, 15, 30, 60].map((opt) => ({
      value: opt,
      label:
        opt === 0
          ? t('settings.work.reminder_at_time')
          : t('settings.work.reminder_minutes', { minutes: String(opt) }),
    })),
  ]);

  const isWeekly = computed(() => form.frequency === 'weekly');
  const isMonthly = computed(() => form.frequency === 'monthly');
  const isYearly = computed(() => form.frequency === 'yearly');

  /**
   * Stores a reference to a template list element for scrolling/highlighting.
   */
  function setTemplateRef(id: string, el: Element | ComponentPublicInstance | null) {
    if (!el || !(el as HTMLElement).scrollIntoView) {
      templateRefs.delete(id);
      return;
    }
    templateRefs.set(id, el as HTMLElement);
  }

  /**
   * Attempts to focus and open the targeted recurring template when requested from elsewhere.
   */
  async function handleTargetTemplate() {
    const targetId = pendingTargetId.value;
    if (!targetId) return;
    if (handledTargets.has(targetId)) return;
    const match = templates.value.find((tpl) => tpl.id === targetId);
    if (!match) return;

    highlightedId.value = targetId;
    handledTargets.add(targetId);
    await nextTick();
    templateRefs.get(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    openEdit(match);
    pendingTargetId.value = null;
    emit('target-consumed');
  }

  function toggleDay(value: number) {
    const next = new Set(form.daysOfWeek ?? []);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    form.daysOfWeek = Array.from(next).sort((a, b) => a - b);
  }

  function toggleMonth(value: number) {
    const next = new Set(form.months ?? []);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    form.months = Array.from(next).sort((a, b) => a - b);
  }

  function resetForm(template?: RecurringTemplate) {
    const fallbackDay = new Date().getDay();
    form.title = template?.title ?? '';
    form.description = template?.description ?? '';
    form.frequency = template?.frequency ?? 'weekly';
    const templateDays =
      template?.daysOfWeek ?? (template?.dayOfWeek != null ? [template.dayOfWeek] : null);
    form.daysOfWeek =
      form.frequency === 'weekly' ? [...(templateDays?.length ? templateDays : [fallbackDay])] : [];
    form.dayOfMonth = template?.dayOfMonth ?? 1;
    form.months = template?.months ? [...template.months] : [];
    form.monthOfYear = template?.monthOfYear ?? template?.months?.[0] ?? new Date().getMonth() + 1;
    form.timeOfDay = template?.isAllDay ? null : (template?.timeOfDay ?? '09:00');
    form.isAllDay = template?.isAllDay ?? false;
    form.leadTimeUnit = template?.leadTimeUnit ?? 'days';
    form.leadTimeValue =
      template?.leadTimeUnit === 'after_completion' ? 0 : (template?.leadTimeValue ?? 0);
    form.reminderMinutes = template?.reminderMinutes ?? null;
    form.overlapPolicy = template?.overlapPolicy ?? 'skip_if_open';
    form.enabled = template?.enabled ?? true;
    form.projectId = template?.projectId ?? null;
  }

  async function loadTemplates() {
    loading.value = true;
    try {
      const list = await window.stina.recurring.get();
      templates.value = list;
      error.value = null;
    } catch (err) {
      error.value = (err as Error)?.message ?? String(err ?? '');
    } finally {
      loading.value = false;
    }
  }

  function openCreate() {
    editing.value = null;
    resetForm();
    showModal.value = true;
  }

  function openEdit(template: RecurringTemplate) {
    editing.value = template;
    resetForm(template);
    showModal.value = true;
  }

  function closeModal() {
    showModal.value = false;
  }

  function frequencySummary(template: RecurringTemplate) {
    const time = template.isAllDay
      ? t('settings.work.recurring_all_day')
      : (template.timeOfDay ?? t('settings.work.recurring_time_missing'));
    const dayLabel = (value: number | null | undefined) =>
      weekdayOptions.value.find((d) => d.value === value)?.label ?? '';
    const monthLabel = (value: number | null | undefined) =>
      monthOptions.value.find((m) => m.value === value)?.label ?? '';

    switch (template.frequency) {
      case 'weekly': {
        const days = (
          template.daysOfWeek?.length
            ? template.daysOfWeek
            : template.dayOfWeek != null
              ? [template.dayOfWeek]
              : []
        )
          .map((d) => dayLabel(d))
          .filter(Boolean)
          .join(', ');
        return t('settings.work.recurring_summary_weekly_multi', {
          days: days || dayLabel(weekdayOptions.value[0]?.value),
          time,
        });
      }
      case 'monthly': {
        const months = template.months?.length
          ? template.months
              .map((m) => monthLabel(m))
              .filter(Boolean)
              .join(', ')
          : t('settings.work.recurring_months_all');
        return t('settings.work.recurring_summary_monthly_multi', {
          day: String(template.dayOfMonth ?? 1),
          months,
          time,
        });
      }
      case 'yearly': {
        const monthText =
          monthLabel(template.monthOfYear ?? template.months?.[0] ?? null) ||
          monthOptions.value[0]?.label ||
          '';
        return t('settings.work.recurring_summary_yearly', {
          day: String(template.dayOfMonth ?? 1),
          month: monthText,
          time,
        });
      }
      default:
        return time;
    }
  }

  function overlapLabel(policy: RecurringTemplate['overlapPolicy']) {
    return overlapOptions.value.find((opt) => opt.value === policy)?.label ?? policy;
  }

  async function saveTemplate() {
    const weeklyDays =
      form.frequency === 'weekly'
        ? form.daysOfWeek.length
          ? [...form.daysOfWeek]
          : [weekdayOptions.value[0]?.value ?? 1]
        : null;

    const leadMinutes =
      form.leadTimeUnit === 'after_completion'
        ? 0
        : form.leadTimeUnit === 'hours'
          ? (Number.isFinite(form.leadTimeValue) ? form.leadTimeValue : 0) * 60
          : (Number.isFinite(form.leadTimeValue) ? form.leadTimeValue : 0) * 24 * 60;

    const payload: Partial<RecurringTemplate> & {
      title: string;
      frequency: RecurringTemplate['frequency'];
    } = {
      title: form.title,
      description: form.description || null,
      frequency: form.frequency,
      daysOfWeek: weeklyDays,
      dayOfMonth: form.frequency === 'weekly' ? null : (form.dayOfMonth ?? 1),
      months: form.frequency === 'monthly' ? (form.months.length ? [...form.months] : null) : null,
      monthOfYear:
        form.frequency === 'yearly' ? form.monthOfYear || monthOptions.value[0]?.value || 1 : null,
      timeOfDay: form.isAllDay ? null : form.timeOfDay || null,
      isAllDay: form.isAllDay,
      leadTimeUnit: form.leadTimeUnit,
      leadTimeValue: form.leadTimeUnit === 'after_completion' ? 0 : (form.leadTimeValue ?? 0),
      leadTimeMinutes: leadMinutes,
      reminderMinutes: form.reminderMinutes ?? null,
      overlapPolicy: form.overlapPolicy,
      enabled: form.enabled,
      projectId: form.projectId ?? null,
    };
    if (editing.value) {
      await window.stina.recurring.update(editing.value.id, payload);
    } else {
      await window.stina.recurring.create(payload);
    }
    await loadTemplates();
    closeModal();
  }

  async function deleteTemplate(template: RecurringTemplate) {
    const confirmed = window.confirm(
      t('settings.work.recurring_delete_confirm', { title: template.title }),
    );
    if (!confirmed) return;
    await window.stina.recurring.delete(template.id);
    await loadTemplates();
  }

  onMounted(() => {
    void loadTemplates();
    const off = window.stina.recurring.onChanged((list) => {
      templates.value = list ?? [];
    });
    disposers.push(off);
  });

  onUnmounted(() => {
    disposers.splice(0).forEach((fn) => fn?.());
  });

  watch(
    () => props.targetTemplateId,
    (next) => {
      if (next && handledTargets.has(next)) {
        pendingTargetId.value = null;
        return;
      }
      pendingTargetId.value = next ?? null;
      if (!next) {
        highlightedId.value = null;
        return;
      }
      void handleTargetTemplate();
    },
    { immediate: true },
  );

  watch(
    () => templates.value.length,
    () => {
      void handleTargetTemplate();
    },
  );

  watch(
    () => form.isAllDay,
    (next) => {
      if (next) {
        form.timeOfDay = null;
      } else if (!form.timeOfDay) {
        form.timeOfDay = '09:00';
      }
    },
  );

  watch(
    () => form.frequency,
    (next) => {
      if (next === 'weekly' && !form.daysOfWeek.length) {
        form.daysOfWeek = [weekdayOptions.value[0]?.value ?? 1];
      }
      if (next !== 'monthly') {
        form.months = [];
      }
      if (next !== 'weekly') {
        form.daysOfWeek = [];
      }
      if (next === 'yearly' && !form.monthOfYear) {
        form.monthOfYear = monthOptions.value[0]?.value ?? 1;
      }
    },
    { immediate: true },
  );
</script>

<template>
  <SettingsPanel>
    <div class="header">
      <SubFormHeader
        :title="t('settings.work.recurring_title')"
        :description="t('settings.work.recurring_description')"
      />
      <SimpleButton type="primary" @click="openCreate">
        {{ t('settings.work.recurring_add_button') }}
      </SimpleButton>
    </div>

    <div v-if="loading" class="status muted">{{ t('settings.work.loading') }}</div>
    <div v-else-if="error" class="status error">{{ error }}</div>
    <div v-else-if="!templates.length" class="status muted">
      {{ t('settings.work.recurring_empty') }}
    </div>
    <ul v-else class="template-list">
      <li
        v-for="template in templates"
        :key="template.id"
        :ref="(el) => setTemplateRef(template.id, el)"
        class="template"
        :class="{ targeted: highlightedId === template.id }"
      >
        <div class="template-main">
          <div>
            <p class="title">
              {{ template.title }}
              <span v-if="!template.enabled" class="badge muted">{{
                t('settings.work.recurring_paused')
              }}</span>
              <span class="badge">{{ overlapLabel(template.overlapPolicy) }}</span>
            </p>
            <p class="summary">{{ frequencySummary(template) }}</p>
            <p v-if="template.description" class="description">{{ template.description }}</p>
          </div>
        </div>
        <div class="actions">
          <SimpleButton size="small" @click="openEdit(template)">
            {{ t('settings.work.edit') }}
          </SimpleButton>
          <SimpleButton type="accent" size="small" @click="deleteTemplate(template)">
            {{ t('settings.work.delete') }}
          </SimpleButton>
        </div>
      </li>
    </ul>
  </SettingsPanel>

  <BaseModal
    :open="showModal"
    :title="
      editing
        ? t('settings.work.recurring_edit_title', { title: editing.title })
        : t('settings.work.recurring_create_title')
    "
    :close-label="t('settings.work.cancel')"
    max-width="720px"
    @close="closeModal"
  >
    <form class="form" @submit.prevent="saveTemplate">
      <label class="field">
        <FormInputText v-model="form.title" :label="t('settings.work.name_label')" required />
      </label>
      <FormTextArea
        v-model="form.description"
        :label="t('settings.work.description_label')"
        :rows="2"
      />
      <div class="grid">
        <FormSelect
          :label="t('settings.work.recurring_frequency_label')"
          :options="frequencyOptions"
          v-model="form.frequency"
          required
        />

        <div v-if="isWeekly" class="chip-field">
          <span class="label">{{ t('settings.work.recurring_weekly_days') }}</span>
          <div class="chip-row">
            <button
              v-for="day in weekdayOptions"
              :key="day.value"
              type="button"
              class="chip"
              :class="{ active: form.daysOfWeek.includes(day.value) }"
              @click="toggleDay(day.value)"
            >
              {{ day.label }}
            </button>
          </div>
          <small class="hint">{{ t('settings.work.recurring_weekly_hint') }}</small>
        </div>

        <div v-if="isMonthly" class="month-field">
          <FormInputText
            :label="t('settings.work.recurring_day_of_month')"
            type="number"
            min="1"
            max="31"
            :model-value="form.dayOfMonth ?? undefined"
            @update:model-value="form.dayOfMonth = $event === '' ? null : Number($event)"
          />
          <div class="chip-field">
            <span class="label">{{ t('settings.work.recurring_months_label') }}</span>
            <div class="chip-row">
              <button
                v-for="month in monthOptions"
                :key="month.value"
                type="button"
                class="chip"
                :class="{ active: form.months.includes(month.value) }"
                @click="toggleMonth(month.value)"
              >
                {{ month.label }}
              </button>
            </div>
            <small class="hint">{{ t('settings.work.recurring_months_hint') }}</small>
          </div>
        </div>

        <div v-if="isYearly" class="yearly-grid">
          <FormSelect
            :label="t('settings.work.recurring_month_label')"
            :options="monthOptions"
            :model-value="form.monthOfYear"
            @update:model-value="form.monthOfYear = Number($event || 1)"
          />
          <FormInputText
            :label="t('settings.work.recurring_day_of_month')"
            type="number"
            min="1"
            max="31"
            :model-value="form.dayOfMonth ?? undefined"
            @update:model-value="form.dayOfMonth = $event === '' ? null : Number($event)"
          />
        </div>

        <div class="inline">
          <FormTime
            :label="t('settings.work.recurring_time_label')"
            :disabled="form.isAllDay"
            :model-value="form.timeOfDay ?? undefined"
            @update:model-value="form.timeOfDay = $event || null"
          />
          <FormCheckbox v-model="form.isAllDay" :label="t('settings.work.all_day_label')" />
        </div>

        <FormSelect
          :label="t('settings.work.recurring_reminder_label')"
          :options="reminderOptions"
          :model-value="form.reminderMinutes ?? ''"
          @update:model-value="form.reminderMinutes = $event === '' ? null : Number($event)"
        />

        <div class="lead-time-row">
          <FormSelect
            :label="t('settings.work.recurring_lead_time_label')"
            :options="leadTimeUnitOptions"
            v-model="form.leadTimeUnit"
          />
          <FormInputText
            :label="t('settings.work.recurring_lead_value_label')"
            type="number"
            min="0"
            :disabled="form.leadTimeUnit === 'after_completion'"
            :model-value="form.leadTimeUnit === 'after_completion' ? '' : form.leadTimeValue"
            @update:model-value="form.leadTimeValue = Number($event ?? 0)"
            :hint="t('settings.work.recurring_lead_time_hint')"
          />
        </div>

        <FormSelect
          :label="t('settings.work.recurring_overlap_label')"
          :options="overlapOptions"
          v-model="form.overlapPolicy"
        />
        <FormCheckbox v-model="form.enabled" :label="t('settings.work.recurring_enabled_label')" />
      </div>
      <div class="footer">
        <SimpleButton @click="closeModal">
          {{ t('settings.work.cancel') }}
        </SimpleButton>
        <SimpleButton
          type="primary"
          :disabled="!form.title.trim() || !form.frequency"
          @click="saveTemplate"
        >
          {{ t('settings.work.save') }}
        </SimpleButton>
      </div>
    </form>
  </BaseModal>
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
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
  }
  .status {
    margin: 0;
    font-size: 0.9rem;
  }
  .muted {
    color: var(--muted);
  }
  .error {
    color: #c44c4c;
  }
  .template-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .template {
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    background: var(--window-bg-lower);
  }
  .template-main {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .title {
    margin: 0;
    font-weight: 600;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .summary {
    margin: 0.1rem 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .description {
    margin: 0.2rem 0 0 0;
    color: var(--text);
    font-size: 0.9rem;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
    font-size: 0.75rem;
  }
  .badge.muted {
    color: var(--muted);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .template.targeted {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .inline {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .chip-field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;

    > .label {
      font-weight: var(--font-weight-medium);
    }

    > .hint {
      color: var(--muted);
      font-size: 0.85rem;
    }
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chip {
    border: 1px solid var(--border);
    background: var(--window-bg-lower);
    color: var(--text);
    padding: 0.35rem 0.6rem;
    border-radius: var(--border-radius-normal);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;

    &.active {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 12%, var(--window-bg-lower));
    }
  }

  .month-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .yearly-grid,
  .lead-time-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
</style>
