<template>
  <div class="bar">
    <div class="actions">
      <IconToggleButton :icon="NewIcon" :tooltip="t('chat.start_new_chat')" @click="$emit('new')" />
      <IconToggleButton
        v-if="canRetry"
        :icon="RetryIcon"
        :tooltip="t('chat.retry_last')"
        @click="$emit('retry-last')"
      />
      <IconToggleButton
        v-if="streaming"
        :icon="StopIcon"
        :tooltip="t('chat.stop_generation')"
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
  import IHugeiconsRefresh from '~icons/hugeicons/refresh';
  import IHugeiconsStop from '~icons/hugeicons/stop';

  import { t } from '@stina/i18n';

  import IconToggleButton from '../ui/IconToggleButton.vue';

  defineProps<{ streaming?: boolean; warning?: string | null; canRetry?: boolean }>();
  defineEmits<{ (e: 'new'): void; (e: 'retry-last'): void; (e: 'stop'): void }>();

  const NewIcon = IHugeiconsChatAdd01;
  const RetryIcon = IHugeiconsRefresh;
  const StopIcon = IHugeiconsStop;
</script>

<style scoped>
  .bar {
    display: flex;
    gap: 2em;
    padding: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
  }
  .actions {
    display: flex;
    gap: 0em;
    align-items: center;
  }
  .warning {
    display: inline-flex;
    align-items: center;
    gap: 2em;
    color: #d97706;
    font-size: 0.75rem;
  }
  .ic {
    font-size: 18px;
    line-height: 1;
  }
</style>
