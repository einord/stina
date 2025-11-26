<template>
  <div class="wrap">
    <label class="label">{{ t('settings.interface.theme_select') }}</label>
    <div class="row">
      <SimpleButton v-for="t in themes" :key="t" :selected="t === current" @click="select(t)">
        {{ themeLabels[t] }}
      </SimpleButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { ref } from 'vue';

  import { type ThemeName, applyTheme, initTheme, themes } from '../../lib/theme';
  import SimpleButton from '../buttons/SimpleButton.vue';

  const current = ref<ThemeName>(initTheme());
  const themeLabels: Record<ThemeName, string> = {
    light: t('settings.interface.themes.light'),
    dark: t('settings.interface.themes.dark'),
  };

  /**
   * Applies the chosen theme and remembers it locally.
   */
  function select(t: ThemeName) {
    current.value = t;
    applyTheme(t);
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
