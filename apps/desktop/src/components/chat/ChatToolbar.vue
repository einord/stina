<template>
  <div class="bar">
    <div class="actions">
      <IconToggleButton :icon="NewIcon" tooltip="Starta ny chatt" @click="$emit('new')" />
      <IconToggleButton
        v-if="streaming"
        :icon="StopIcon"
        tooltip="Stoppa generering"
        @click="$emit('stop')"
      />
    </div>
    <div v-if="warning" class="warning">
      <span class="ic">⚠️</span>
      <span>{{ warning }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import IHugeiconsChatAdd01 from '~icons/hugeicons/chat-add-01';
  import IHugeiconsStop from '~icons/hugeicons/stop';

  import IconToggleButton from '../ui/IconToggleButton.vue';

  defineProps<{ streaming?: boolean; warning?: string | null }>();

  const NewIcon = IHugeiconsChatAdd01;
  const StopIcon = IHugeiconsStop;
</script>

<style scoped>
  .bar {
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-3);
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
