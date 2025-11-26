<script setup lang="ts">
  import { t } from '@stina/i18n';

  interface Props {
    count: number;
  }

  defineProps<Props>();
</script>

<template>
  <header class="panel-header">
    <div>
      <h2 class="panel-title">{{ t('todos.title') }}</h2>
      <p class="panel-subtitle">{{ t('todos.subtitle') }}</p>
    </div>
    <span class="panel-count" :aria-label="t('todos.count_aria', { count: String(count) })">
      {{ count }}
    </span>
  </header>
</template>

<style scoped>
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text);
  }
  .panel-subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .panel-count {
    min-width: 32px;
    text-align: center;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
  }
</style>
