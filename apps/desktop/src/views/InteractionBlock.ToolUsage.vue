<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';
  import { t } from '@stina/i18n';
  import { computed, ref } from 'vue';

  const props = defineProps<{
    message: InteractionMessage;
  }>();

  const expanded = ref(false);
  const meta = computed(() => {
    const raw = props.message.metadata;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as { tool?: string; args?: unknown };
    } catch {
      return null;
    }
  });
  const toolName = computed(() =>
    meta.value?.tool != null ? t(`tool.${meta.value.tool}`) : (props.message.content ?? 'Tool'),
  );
  const argsJson = computed(() => {
    if (!meta.value?.args) return null;
    try {
      return JSON.stringify(meta.value.args, null, 2);
    } catch {
      return String(meta.value.args);
    }
  });
</script>

<template>
  <button
    type="button"
    class="tool-usage"
    :aria-expanded="expanded"
    :aria-label="expanded ? t('chat.tool_hide_details') : t('chat.tool_show_details')"
    @click="expanded = !expanded"
  >
    <div class="icon"><i-hugeicons-wrench-01 /></div>
    <div class="body">
      <div class="title">{{ toolName }}</div>
      <pre v-if="expanded && argsJson" class="args" @click.stop><code>{{ argsJson }}</code></pre>
    </div>
  </button>
</template>

<style scoped>
  .tool-usage {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.5em;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.25rem 0.5rem;
    margin-left: auto;
    margin-right: auto;
    background: var(--bg-elev);
    cursor: pointer;
    color: var(--bg-elev-fg);
    text-align: left;
    font-size: 0.75rem;

    > .icon {
      font-size: 1rem;
      line-height: 1;
      margin-top: 2px;
      align-self: start;
    }
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 2em;
  }
  .title {
    font-weight: 600;
    font-size: 0.75rem;
  }
  .args {
    margin: 0;
    background: var(--panel);
    padding: 2em;
    border-radius: 6px;
    max-width: 520px;
    overflow-x: auto;
    font-size: 0.85rem;

    > code {
      background: transparent;
      padding: 0;
    }
  }
</style>
