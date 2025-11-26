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

    <div class="section danger">
      <h3 class="section-title">{{ t('settings.interface.history_title') }}</h3>
      <p class="section-description">
        {{ t('settings.interface.history_description') }}
      </p>
      <SimpleButton type="danger" @click="confirmAndClearHistory">
        {{ t('settings.interface.history_clear_button') }}
      </SimpleButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';

  import SimpleButton from '../buttons/SimpleButton.vue';

  import LanguageSelector from './LanguageSelector.vue';
  import ThemeSelector from './ThemeSelector.vue';

  async function confirmAndClearHistory() {
    if (!confirm(t('settings.interface.history_confirm'))) return;
    try {
      await window.stina.chat.clearHistoryExceptActive();
    } catch (error) {
      alert(t('settings.interface.history_error'));
    }
  }
</script>

<style scoped>
  .interface-settings {
    display: flex;
    flex-direction: column;
    gap: 6em;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 3em;
  }

  .section-title {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 600;
  }

  .section-description {
    margin: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .danger {
    border: 1px solid var(--border);
    padding: 4em;
    border-radius: 2em;
    background: var(--bg-elev);
  }
</style>
