<script setup lang="ts">
  import { t } from '@stina/i18n';

  const emit = defineEmits<{
    configure: [];
  }>();
</script>

<template>
  <div class="empty-state">
    <p>{{ t('chat.no_provider_selected') }}</p>
    <button class="primary" type="button" @click="emit('configure')">
      {{ t('chat.configure_provider_button') }}
    </button>
  </div>
</template>

<style scoped>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4em;
    padding: var(--space-8);
    text-align: center;
    color: var(--muted);

    > p {
      margin: 0;
      font-size: var(--text-base);
    }

    > button.primary {
      padding: 2em 4em;
      background: var(--accent);
      color: var(--bg);
      border: none;
      border-radius: 2em;
      font: inherit;
      cursor: pointer;

      &:hover {
        opacity: 0.9;
      }
    }
  }
</style>
