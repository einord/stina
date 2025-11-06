<template>
  <div class="bar">
    <IconButton :icon-component="NewIcon" aria="Start new chat" @click="$emit('new')"
      >New</IconButton
    >
    <IconButton v-if="streaming" aria="Stop generation" @click="$emit('stop')">Stop</IconButton>
  </div>
</template>

<script setup lang="ts">
  import IconButton from '../ui/IconButton.vue';

  import IHugeiconsChatAdd01 from '~icons/hugeicons/chat-add-01';


  defineProps<{ streaming?: boolean }>();

  const NewIcon = IHugeiconsChatAdd01;
</script>

<style scoped>
  .bar {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
  }
</style>
