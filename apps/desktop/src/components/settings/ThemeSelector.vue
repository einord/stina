<template>
  <div class="wrap">
    <label class="label">Theme</label>
    <div class="row">
      <SimpleButton v-for="t in themes" :key="t" :selected="t === current" @click="select(t)">
        {{ t }}
      </SimpleButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';

  import { type ThemeName, applyTheme, initTheme, themes } from '../../lib/theme';
  import SimpleButton from '../buttons/SimpleButton.vue';

  const current = ref<ThemeName>(initTheme());
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
    gap: var(--space-3);
  }
  .row {
    display: flex;
    gap: var(--space-2);
  }
  .label {
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
