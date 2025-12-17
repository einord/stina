<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed, onMounted, ref, watch } from 'vue';

  import FormSearchSelect, { type SearchSelectOption, type SearchSelectValue } from '../form/FormSearchSelect.vue';

  /**
   * Returns an ordered list of supported IANA timezone identifiers.
   * Falls back to a short list when Intl.supportedValuesOf is not available.
   */
  function listSupportedTimeZones(systemTimeZone: string): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    if (typeof supportedValuesOf === 'function') {
      const zones = supportedValuesOf('timeZone');
      return zones.length ? zones : [systemTimeZone, 'UTC'];
    }
    return [systemTimeZone, 'UTC', 'Europe/Stockholm', 'Europe/London', 'America/New_York'];
  }

  const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const zones = listSupportedTimeZones(systemTimeZone);

  const current = ref<SearchSelectValue>(null);
  const error = ref<string>('');
  const initialized = ref(false);

  const options = computed<SearchSelectOption[]>(() => [
    { value: null, label: t('settings.localization.timezone_system_default', { timeZone: systemTimeZone }) },
    ...zones.map((z) => ({ value: z, label: z })),
  ]);

  onMounted(async () => {
    try {
      const saved = await window.stina.settings.getTimeZone();
      current.value = saved ?? null;
    } finally {
      initialized.value = true;
    }
  });

  watch(
    () => current.value,
    async (next) => {
      if (!initialized.value) return;
      error.value = '';
      try {
        await window.stina.settings.setTimeZone(typeof next === 'string' && next.trim() ? next : null);
      } catch {
        error.value = t('settings.localization.timezone_save_error');
      }
    },
  );
</script>

<template>
  <FormSearchSelect
    v-model="current"
    :label="t('settings.localization.timezone_label')"
    :hint="t('settings.localization.timezone_hint')"
    :placeholder="t('settings.localization.timezone_placeholder')"
    :options="options"
    :error="error || undefined"
  />
</template>

