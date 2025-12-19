<template>
  <FormButtonSelect
    :label="t('settings.localization.language_select')"
    :options="languages.map((lang) => ({ value: lang.code, label: lang.name }))"
    :model-value="current"
    @update:model-value="select(String($event))"
  />
</template>

<script setup lang="ts">
  import { getLang, setLang, t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import FormButtonSelect from '../form/FormButtonSelect.vue';

  const languages = [
    { code: 'en', name: t('settings.localization.languages.en') },
    { code: 'sv', name: t('settings.localization.languages.sv') },
  ];

  const current = ref<string>(getLang());

  onMounted(async () => {
    // Load the saved language preference
    const savedLang = await window.stina.settings.getLanguage();
    if (savedLang) {
      current.value = savedLang;
      setLang(savedLang);
    }
  });

  /**
   * Applies the chosen language and saves it to settings.
   * Updates both the UI and system prompts.
   */
  async function select(lang: string) {
    current.value = lang;
    setLang(lang);
    await window.stina.settings.setLanguage(lang);
    // Force a re-render of the entire app to update all translations
    location.reload();
  }
</script>
