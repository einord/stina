<template>
  <div class="localization-settings">
    <SettingsPanel>
      <SubFormHeader
        :title="t('settings.localization.language_title')"
        :description="t('settings.localization.language_hint')"
      />
      <LanguageSelector />
    </SettingsPanel>

    <SettingsPanel>
      <SubFormHeader
        :title="t('settings.localization.timezone_title')"
        :description="t('settings.localization.timezone_hint')"
      />
      <TimezoneSelector />
    </SettingsPanel>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';

  import SettingsPanel from '../common/SettingsPanel.vue';
  import SubFormHeader from '../common/SubFormHeader.vue';

  import LanguageSelector from './LanguageSelector.vue';
  import TimezoneSelector from './TimezoneSelector.vue';
</script>

<style scoped>
  .localization-settings {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
</style>

