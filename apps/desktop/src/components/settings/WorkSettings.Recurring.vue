<script setup lang="ts">
  import type { RecurringTemplate } from '@stina/todos';
  import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch,
    type ComponentPublicInstance,
  } from 'vue';

  import { t } from '@stina/i18n';
  import BaseModal from '../common/BaseModal.vue';
  import SimpleButton from '../buttons/SimpleButton.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';

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

  const form = reactive({
    title: '',
    description: '',
    frequency: 'weekday' as RecurringTemplate['frequency'],
    dayOfWeek: 1 as number | null,
    dayOfMonth: 1 as number | null,
    timeOfDay: '09:00' as string | null,
    isAllDay: false,
    leadTimeMinutes: 0,
    overlapPolicy: 'skip_if_open' as RecurringTemplate['overlapPolicy'],
    maxAdvanceCount: 1,
    enabled: true,
    projectId: null as string | null,
  });

  const frequencyOptions = computed(() => [
    { value: 'daily', label: t('settings.work.recurring_frequency_daily') },
    { value: 'weekday', label: t('settings.work.recurring_frequency_weekday') },
    { value: 'weekly', label: t('settings.work.recurring_frequency_weekly') },
    { value: 'monthly', label: t('settings.work.recurring_frequency_monthly') },
  ]);

  const overlapOptions = computed(() => [
    { value: 'skip_if_open', label: t('settings.work.recurring_overlap_skip') },
    { value: 'allow_multiple', label: t('settings.work.recurring_overlap_allow') },
    { value: 'replace_open', label: t('settings.work.recurring_overlap_replace') },
  ]);

  const dayOfWeekOptions = computed(() => [
    { value: 1, label: t('settings.work.day_names.mon') },
    { value: 2, label: t('settings.work.day_names.tue') },
    { value: 3, label: t('settings.work.day_names.wed') },
    { value: 4, label: t('settings.work.day_names.thu') },
    { value: 5, label: t('settings.work.day_names.fri') },
    { value: 6, label: t('settings.work.day_names.sat') },
    { value: 0, label: t('settings.work.day_names.sun') },
  ]);

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
    const match = templates.value.find((tpl) => tpl.id === targetId);
    if (!match) return;

    highlightedId.value = targetId;
    await nextTick();
    templateRefs.get(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    openEdit(match);
    pendingTargetId.value = null;
  }

  function resetForm(template?: RecurringTemplate) {
    form.title = template?.title ?? '';
    form.description = template?.description ?? '';
    form.frequency = template?.frequency ?? 'weekday';
    form.dayOfWeek = template?.dayOfWeek ?? 1;
    form.dayOfMonth = template?.dayOfMonth ?? 1;
    form.timeOfDay = template?.isAllDay ? template?.timeOfDay ?? null : template?.timeOfDay ?? '09:00';
    form.isAllDay = template?.isAllDay ?? false;
    form.leadTimeMinutes = template?.leadTimeMinutes ?? 0;
    form.overlapPolicy = template?.overlapPolicy ?? 'skip_if_open';
    form.maxAdvanceCount = template?.maxAdvanceCount ?? 1;
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
      : template.timeOfDay ?? t('settings.work.recurring_time_missing');
    switch (template.frequency) {
      case 'daily':
        return t('settings.work.recurring_summary_daily', { time });
      case 'weekday':
        return t('settings.work.recurring_summary_weekday', { time });
      case 'weekly': {
        const day = dayOfWeekOptions.value.find((d) => d.value === template.dayOfWeek)?.label;
        return t('settings.work.recurring_summary_weekly', { day: day ?? '', time });
      }
      case 'monthly':
        return t('settings.work.recurring_summary_monthly', {
          day: String(template.dayOfMonth ?? 1),
          time,
        });
      default:
        return time;
    }
  }

  function overlapLabel(policy: RecurringTemplate['overlapPolicy']) {
    return overlapOptions.value.find((opt) => opt.value === policy)?.label ?? policy;
  }

  async function saveTemplate() {
    const payload: Partial<RecurringTemplate> & {
      title: string;
      frequency: RecurringTemplate['frequency'];
    } = {
      title: form.title,
      description: form.description || null,
      frequency: form.frequency,
      dayOfWeek: form.frequency === 'weekly' ? form.dayOfWeek ?? 1 : null,
      dayOfMonth: form.frequency === 'monthly' ? form.dayOfMonth ?? 1 : null,
      timeOfDay: form.isAllDay ? null : form.timeOfDay || null,
      isAllDay: form.isAllDay,
      leadTimeMinutes: Number.isFinite(form.leadTimeMinutes) ? form.leadTimeMinutes : 0,
      overlapPolicy: form.overlapPolicy,
      maxAdvanceCount: form.maxAdvanceCount || 1,
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
</script>

<template>
  <section class="panel">
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
  </section>

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
        <span>{{ t('settings.work.name_label') }}</span>
        <input v-model="form.title" type="text" required />
      </label>
      <label class="field">
        <span>{{ t('settings.work.description_label') }}</span>
        <textarea v-model="form.description" rows="2" />
      </label>
      <div class="grid">
        <label class="field">
          <span>{{ t('settings.work.recurring_frequency_label') }}</span>
          <select v-model="form.frequency">
            <option v-for="opt in frequencyOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label v-if="form.frequency === 'weekly'" class="field">
          <span>{{ t('settings.work.recurring_day_of_week') }}</span>
          <select v-model.number="form.dayOfWeek">
            <option v-for="opt in dayOfWeekOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label v-if="form.frequency === 'monthly'" class="field">
          <span>{{ t('settings.work.recurring_day_of_month') }}</span>
          <input v-model.number="form.dayOfMonth" type="number" min="1" max="31" />
        </label>
        <label class="field">
          <span>{{ t('settings.work.recurring_time_label') }}</span>
          <div class="inline">
            <input
              v-model="form.timeOfDay"
              type="time"
              inputmode="numeric"
              pattern="^\\d{2}:\\d{2}$"
              :disabled="form.isAllDay"
            />
            <label class="checkbox">
              <input v-model="form.isAllDay" type="checkbox" />
              <span>{{ t('settings.work.all_day_label') }}</span>
            </label>
          </div>
        </label>
        <label class="field">
          <span>{{ t('settings.work.recurring_lead_time_label') }}</span>
          <input v-model.number="form.leadTimeMinutes" type="number" min="0" />
          <small class="hint">{{ t('settings.work.recurring_lead_time_hint') }}</small>
        </label>
        <label class="field">
          <span>{{ t('settings.work.recurring_overlap_label') }}</span>
          <select v-model="form.overlapPolicy">
            <option v-for="opt in overlapOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('settings.work.recurring_max_advance_label') }}</span>
          <input v-model.number="form.maxAdvanceCount" type="number" min="1" max="5" />
        </label>
        <label class="field checkbox">
          <input v-model="form.enabled" type="checkbox" />
          <span>{{ t('settings.work.recurring_enabled_label') }}</span>
        </label>
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
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.95rem;
    color: var(--text);
  }
  .field > input,
  .field > textarea,
  .field > select {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-normal);
    padding: 0.65rem 0.75rem;
    background: var(--window-bg-lower);
    color: var(--text);
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .checkbox {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
</style>
