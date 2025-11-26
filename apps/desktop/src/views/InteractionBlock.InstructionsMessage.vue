<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';
  import { t } from '@stina/i18n';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="instructions-message">
    <div class="header">{{ t('chat.instructions.header') }}</div>
    <MarkDown class="content" :content="message.content" />
  </div>
</template>

<style scoped>
  .instructions-message {
    border: 1px solid var(--secondary);
    padding: 1rem;
    background-color: hsla(0, 0%, 100%, 0.05);
    border-radius: 0.5rem;

    > .header {
      font-weight: 800;
      margin-bottom: 1rem;
      text-align: center;
    }

    > .content {
      font-family: monospace;
    }
  }
</style>
