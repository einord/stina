<template>
  <div class="advanced-settings">
    <h2>{{ t('settings.advanced.title') }}</h2>
    <p class="description">{{ t('settings.advanced.description') }}</p>

    <div class="setting-item">
      <div class="setting-header">
        <label for="debug-mode">{{ t('settings.advanced.debug_mode') }}</label>
        <input
          id="debug-mode"
          v-model="debugMode"
          type="checkbox"
          @change="handleDebugModeChange"
        />
      </div>
      <p class="setting-help">{{ t('settings.advanced.debug_mode_help') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { onMounted, ref } from 'vue';

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
  }

  h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .description {
    margin: 0 0 24px 0;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .setting-item {
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .setting-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  input[type='checkbox'] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--accent);
  }

  .setting-help {
    margin: 0;
    font-size: 13px;
    color: var(--text-tertiary);
    line-height: 1.5;
  }
</style>
