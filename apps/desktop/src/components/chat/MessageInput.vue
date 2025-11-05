<template>
  <form class="wrap" @submit.prevent="$emit('send', text)">
    <input class="input" type="text" v-model="text" placeholder="Type a message..." />
    <IconButton :icon-component="SendIcon" aria="Send" @click="$emit('send', text)" />
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import IconButton from '../ui/IconButton.vue';
import IHugeiconsArrowRight01 from '~icons/hugeicons/arrow-right-01';

const text = ref('');
const SendIcon = IHugeiconsArrowRight01;
</script>

<style scoped>
.wrap {
  display: grid; grid-template-columns: 1fr auto; gap: var(--space-2);
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