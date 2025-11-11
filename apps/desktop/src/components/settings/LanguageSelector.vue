<template>
  <div class="wrap">
    <label class="label">{{ t('settings.interface.language_select') }}</label>
    <div class="row">
      <button
        v-for="lang in languages"
        :key="lang.code"
        class="opt"
        :class="{ active: lang.code === current }"
        @click="select(lang.code)"
      >
        {{ lang.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { getLang, setLang, t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

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
    gap: var(--space-3);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
  .opt {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-2);
    cursor: pointer;
    transition: all 0.2s;
  }
  .opt:hover {
    border-color: var(--primary);
  }
  .opt.active {
    outline: 2px solid var(--primary);
  }
  .label {
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
