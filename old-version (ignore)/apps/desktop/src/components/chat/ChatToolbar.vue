<template>
  <div class="bar">
    <div class="actions">
      <IconToggleButton
        :icon="NewIcon"
        :tooltip="t('chat.start_new_chat')"
        :disabled="disableNew"
        @click="$emit('new')"
      />
      <IconToggleButton
        v-if="canRetry"
        :icon="RetryIcon"
        :tooltip="t('chat.retry_last')"
        @click="$emit('retry-last')"
      />
    </div>
    <div
      v-if="quickCommandList?.length"
      class="quick-commands"
      role="group"
      :aria-label="t('settings.quick_commands.toolbar_label')"
    >
      <IconToggleButton
        v-for="command in quickCommandList"
        :key="command.id"
        :icon="resolveQuickCommandIcon(command.icon)"
        type="button"
        class="quick-command"
        :title="command.text"
        :tooltip="command.text"
        @click="onQuickCommand(command)"
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

  import { t } from '@stina/i18n';
  import type { QuickCommand } from '@stina/settings';
  import { computed } from 'vue';

  import { resolveQuickCommandIcon } from '../../lib/quickCommandIcons';
  import IconToggleButton from '../ui/IconToggleButton.vue';

  const props = defineProps<{
    warning?: string | null;
    canRetry?: boolean;
    disableNew?: boolean;
    quickCommands?: QuickCommand[];
  }>();
  const warning = computed(() => props.warning);
  const canRetry = computed(() => props.canRetry);
  const disableNew = computed(() => props.disableNew);
  const quickCommandList = computed(() => props.quickCommands ?? []);
  const emit = defineEmits<{
    (e: 'new'): void;
    (e: 'retry-last'): void;
    (e: 'quick-command', command: QuickCommand): void;
  }>();

  const NewIcon = IHugeiconsChatAdd01;
  const RetryIcon = IHugeiconsRefresh;

  function onQuickCommand(command: QuickCommand) {
    emit('quick-command', command);
  }
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
  .quick-commands {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .quick-command {
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    background: var(--bg-bg);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      border-color 0.12s ease,
      box-shadow 0.12s ease,
      background-color 0.12s ease;

    &:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
    }
  }

  .quick-icon {
    width: 1.1rem;
    height: 1.1rem;
    color: inherit;
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
