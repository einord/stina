<template>
  <div class="wrap">
    <label class="label">{{ t('settings.interface.language_select') }}</label>
    <div class="row">
      <SimpleButton
        v-for="lang in languages"
        :key="lang.code"
        :selected="lang.code === current"
        @click="select(lang.code)"
      >
        {{ lang.name }}
      </SimpleButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { getLang, setLang, t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import SimpleButton from '../buttons/SimpleButton.vue';

  const languages = [
    { code: 'en', name: t('settings.interface.languages.en') },
    { code: 'sv', name: t('settings.interface.languages.sv') },
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

<style scoped>
  .wrap {
    display: grid;
    gap: 3em;
  }
  .row {
    display: flex;
    gap: 2em;
  }
  .label {
    color: var(--muted);
    font-size: 0.75rem;
  }
</style>
