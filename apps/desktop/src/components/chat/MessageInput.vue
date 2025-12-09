<template>
  <form class="wrap" @submit.prevent="submit">
    <textarea
      ref="textareaEl"
      class="input"
      v-model="text"
      :placeholder="t('chat.type_message')"
      :rows="rows"
      @input="autoResize"
      @keydown.enter="onEnter"
    />
  </form>
</template>

<script setup lang="ts">
  import { t } from '@stina/i18n';
  import { computed, nextTick, ref } from 'vue';

  const text = ref('');
  const textareaEl = ref<HTMLTextAreaElement | null>(null);
  const MIN_ROWS = 1;
  const MAX_ROWS = 10;
  const rows = computed(() => Math.min(MAX_ROWS, Math.max(MIN_ROWS, text.value.split('\n').length)));

  const emit = defineEmits<{ (e: 'send', value: string): void }>();
  /**
   * Emits the trimmed message when the form is submitted.
   */
  function submit() {
    const v = text.value.trim();
    if (!v) return;
    emit('send', v);
    text.value = '';
    void nextTick(autoResize);
  }

  function autoResize() {
    const el = textareaEl.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, el.scrollHeight)}px`;
  }

  function onEnter(event: KeyboardEvent) {
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      // allow newline
      return;
    }
    event.preventDefault();
    submit();
  }
</script>

<style scoped>
  .wrap {
    display: grid;
    grid-template-columns: 1fr auto;
    padding: 0 1rem 1rem 1rem;
    /* border-top: 1px solid var(--border); */
  }
  .input {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    background: var(--text-input-bg);
    color: var(--text-input-fg);
    border-radius: 1em;
    resize: none;
    line-height: 1.4;
    font: inherit;
    overflow: hidden;
  }
</style>
