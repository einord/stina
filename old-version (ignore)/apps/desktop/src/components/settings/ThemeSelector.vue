<template>
  <FormButtonSelect
    :label="t('settings.interface.theme_select')"
    :options="themes.map((theme) => ({ value: theme, label: themeLabels[theme] }))"
    :model-value="current"
    @update:model-value="select($event as ThemeName)"
  />
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { ref } from 'vue';

  import { type ThemeName, applyTheme, initTheme, themes } from '../../lib/theme';
  import FormButtonSelect from '../form/FormButtonSelect.vue';

  const current = ref<ThemeName>(initTheme());
  const themeLabels: Record<ThemeName, string> = {
    light: t('settings.interface.themes.light'),
    dark: t('settings.interface.themes.dark'),
  };

  /**
   * Applies the chosen theme and remembers it locally.
   */
  function select(t: ThemeName) {
    current.value = t;
    applyTheme(t);
  }
</script>
