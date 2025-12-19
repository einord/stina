<template>
  <div class="advanced-settings">
    <FormHeader
      :title="t('settings.advanced.title')"
      :description="t('settings.advanced.description')"
    />

    <SettingsPanel>
      <FormCheckbox
        v-model="debugMode"
        :label="t('settings.advanced.debug_mode')"
        @update:model-value="handleDebugModeChange"
      />
      <p class="setting-help">{{ t('settings.advanced.debug_mode_help') }}</p>
    </SettingsPanel>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import FormHeader from '../common/FormHeader.vue';
  import FormCheckbox from '../form/FormCheckbox.vue';
  import SettingsPanel from '../common/SettingsPanel.vue';

  const debugMode = ref(false);

  onMounted(async () => {
    const settings = await window.stina.settings.get();
    debugMode.value = settings.advanced?.debugMode ?? false;
  });

  async function handleDebugModeChange() {
    await window.stina.settings.updateAdvanced({ debugMode: debugMode.value });
    await window.stina.chat.setDebugMode(debugMode.value);
  }
</script>

<style scoped>
  .advanced-settings {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 1rem;

    > .settings-panel > .setting-help {
      margin: 0;
      font-size: 13px;
      color: var(--text-tertiary);
      line-height: 1.5;
    }
  }
</style>
