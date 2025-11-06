<template>
  <div class="bar">
    <IconButton :icon-component="NewIcon" aria="Start new chat" @click="$emit('new')"
      >New</IconButton
    >
  </div>
</template>

<script setup lang="ts">
  import IHugeiconsChatAdd01 from '~icons/hugeicons/chat-add-01';

  import IconButton from '../ui/IconButton.vue';

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
