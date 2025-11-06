<template>
  <div class="wrap">
    <label class="label">Theme</label>
    <div class="row">
      <button
        v-for="t in themes"
        :key="t"
        class="opt"
        :class="{ active: t === current }"
        @click="select(t)"
      >
        {{ t }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';

  import { type ThemeName, applyTheme, initTheme, themes } from '../../lib/theme';

  const current = ref<ThemeName>(initTheme());
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
  .opt {
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border);
    background: var(--panel);
    border-radius: var(--radius-2);
    text-transform: capitalize;
  }
  .opt.active {
    outline: 2px solid var(--primary);
  }
  .label {
    color: var(--muted);
    font-size: var(--text-sm);
  }
</style>
