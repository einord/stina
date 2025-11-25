<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';
  import { t } from '@stina/i18n';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="instructions-message">
    <div class="header">{{ t('chat.instructions.header') }}</div>
    <div class="content" v-html="message.content.replaceAll('\n', '<br />')"></div>
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
