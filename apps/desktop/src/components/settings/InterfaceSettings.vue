<template>
  <div class="interface-settings">
    <SettingsPanel>
      <SubFormHeader
        :title="t('settings.interface.theme_title')"
        :description="t('settings.interface.theme_select')"
      />
      <ThemeSelector />
    </SettingsPanel>

    <SettingsPanel>
      <SubFormHeader
        :title="t('settings.interface.language_title')"
        :description="t('settings.interface.language_select')"
      />
      <LanguageSelector />
    </SettingsPanel>

    <SettingsPanel tone="danger">
      <SubFormHeader
        :title="t('settings.interface.history_title')"
        :description="t('settings.interface.history_description')"
      />
      <SimpleButton type="danger" @click="confirmAndClearHistory">
        {{ t('settings.interface.history_clear_button') }}
      </SimpleButton>
    </SettingsPanel>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';

  import SimpleButton from '../buttons/SimpleButton.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';

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
    gap: 1.5rem;
  }
</style>
