<template>
  <div class="advanced-settings">
    <h2>{{ t('settings.advanced.title') }}</h2>
    <p class="description">{{ t('settings.advanced.description') }}</p>

    <div class="setting-item">
      <FormCheckbox
        v-model="debugMode"
        :label="t('settings.advanced.debug_mode')"
        @update:model-value="handleDebugModeChange"
      />
      <p class="setting-help">{{ t('settings.advanced.debug_mode_help') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

  import FormCheckbox from '../form/FormCheckbox.vue';

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

    > h2 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    > .description {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: var(--text-secondary);
    }

    > .setting-item {
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    > .setting-item > .setting-help {
      margin: 0;
      font-size: 13px;
      color: var(--text-tertiary);
      line-height: 1.5;
    }
  }
</style>
