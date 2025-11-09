<template>
  <form class="wrap" @submit.prevent="submit">
    <input class="input" type="text" v-model="text" :placeholder="t('chat.type_message')" />
    <!-- <IconButton :icon-component="SendIcon" aria="Send" type="submit" /> -->
  </form>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { ref } from 'vue';

  const text = ref('');

  const emit = defineEmits<{ (e: 'send', value: string): void }>();
  /**
   * Emits the trimmed message when the form is submitted.
   */
  function submit() {
    const v = text.value.trim();
    if (!v) return;
    emit('send', v);
    text.value = '';
  }
</script>

<style scoped>
  .wrap {
    display: grid;
    grid-template-columns: 1fr auto;
    /* gap: var(--space-2); */
    padding: var(--space-1) var(--space-3) var(--space-3) var(--space-3);
    /* border-top: 1px solid var(--border); */
  }
  .input {
    padding: var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-2);
  }
</style>
