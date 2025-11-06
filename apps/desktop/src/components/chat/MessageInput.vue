<template>
  <form class="wrap" @submit.prevent="submit">
    <input class="input" type="text" v-model="text" placeholder="Type a message..." />
    <IconButton :icon-component="SendIcon" aria="Send" type="submit" />
  </form>
</template>

<script setup lang="ts">
  import IHugeiconsArrowRight01 from '~icons/hugeicons/arrow-right-01';

  import { ref } from 'vue';

  import IconButton from '../ui/IconButton.vue';

  const text = ref('');
  const SendIcon = IHugeiconsArrowRight01;

  const emit = defineEmits<{ (e: 'send', value: string): void }>();
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
    gap: var(--space-2);
    padding: var(--space-3);
    border-top: 1px solid var(--border);
  }
  .input {
    padding: var(--space-3);
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    border-radius: var(--radius-2);
  }
</style>
