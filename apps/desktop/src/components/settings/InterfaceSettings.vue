<template>
  <div class="interface-settings">
    <div class="section">
      <h3 class="section-title">{{ t('settings.interface.theme_title') }}</h3>
      <ThemeSelector />
    </div>

    <div class="section">
      <h3 class="section-title">{{ t('settings.interface.language_title') }}</h3>
      <LanguageSelector />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';

  import LanguageSelector from './LanguageSelector.vue';
  import ThemeSelector from './ThemeSelector.vue';
</script>

<style scoped>
  .interface-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-title {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }
</style>
