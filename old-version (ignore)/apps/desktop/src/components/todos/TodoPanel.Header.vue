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
      <h2 class="title">{{ t('todos.title') }}</h2>
      <p class="subtitle">{{ t('todos.subtitle') }}</p>
    </div>
    <span class="item-count" :aria-label="t('todos.count_aria', { count: String(count) })">
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
  .title {
    margin: 0;
    color: var(--text);
  }
  .subtitle {
    margin: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .item-count {
    min-width: 32px;
    aspect-ratio: 1 / 1;
    display: grid;
    place-items: center;
    text-align: center;
    border-radius: 999px;
    border: 1px solid var(--border);
  }
</style>
