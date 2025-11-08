<template>
  <div class="bar">
    <div class="actions">
      <IconButton :icon-component="NewIcon" aria="Start new chat" @click="$emit('new')"
        >New</IconButton
      >
      <IconButton v-if="streaming" aria="Stop generation" @click="$emit('stop')">Stop</IconButton>
    </div>
    <div v-if="warning" class="warning">
      <span class="ic">⚠️</span>
      <span>{{ warning }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import IHugeiconsChatAdd01 from '~icons/hugeicons/chat-add-01';

  import IconButton from '../ui/IconButton.vue';

  defineProps<{ streaming?: boolean; warning?: string | null }>();

  const NewIcon = IHugeiconsChatAdd01;
</script>

<style scoped>
  .bar {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-top: 1px solid var(--border);
    background: var(--bg-elev);
    align-items: center;
    justify-content: space-between;
  }
  .actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }
  .warning {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: #d97706;
    font-size: var(--text-sm);
  }
  .ic {
    font-size: 18px;
    line-height: 1;
  }
</style>
