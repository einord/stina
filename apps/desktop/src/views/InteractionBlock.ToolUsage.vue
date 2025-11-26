<script setup lang="ts">
  import type { InteractionMessage } from '@stina/chat/types';
  import { t } from '@stina/i18n';
  import { computed, reactive } from 'vue';

  const props = defineProps<{
    messages: InteractionMessage[];
  }>();

  const expanded = reactive<Record<string, boolean>>({});

  function parseMeta(message: InteractionMessage) {
    const raw = message.metadata;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as { tool?: string; args?: unknown };
    } catch {
      return null;
    }
  }

  const tools = computed(() =>
    props.messages.map((message) => {
      const meta = parseMeta(message);
      const toolName = meta?.tool != null ? t(`tool.${meta.tool}`) : (message.content ?? 'Tool');
      let args: string | null = null;
      if (meta?.args) {
        try {
          args = JSON.stringify(meta.args, null, 2);
        } catch {
          args = String(meta.args);
        }
      }
      return { id: message.id, toolName, args };
    }),
  );
</script>

<template>
  <div class="tool-usage-group">
    <button
      v-for="tool in tools"
      :key="tool.id"
      type="button"
      class="tool-usage"
      :aria-expanded="expanded[tool.id] ?? false"
      :aria-label="
        (expanded[tool.id] ?? false) ? t('chat.tool_hide_details') : t('chat.tool_show_details')
      "
      @click="expanded[tool.id] = !expanded[tool.id]"
    >
      <div class="icon"><i-hugeicons-wrench-01 /></div>
      <div class="body">
        <div class="title">{{ tool.toolName }}</div>
        <pre
          v-if="(expanded[tool.id] ?? false) && tool.args"
          class="args"
          @click.stop
        ><code>{{ tool.args }}</code></pre>
      </div>
    </button>
  </div>
</template>

<style scoped>
  .tool-usage-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 1rem;
    justify-content: center;
    align-items: start;

    > .tool-usage {
      display: inline-flex;
      width: fit-content;
      align-items: center;
      gap: 0.5em;
      border: 1px solid var(--bg-elev-fg);
      border-radius: 0.75rem;
      padding: 0.5rem;
      background: var(--bg-elev);
      cursor: pointer;
      color: var(--bg-elev-fg);
      text-align: left;
      font-size: 0.75rem;
      overflow-x: hidden;

      > .icon {
        font-size: 1rem;
        line-height: 1;
        margin-top: 2px;
        align-self: start;
      }

      > .body {
        display: flex;
        flex-direction: column;
        gap: 0.5em;
        overflow-x: hidden;

        > .title {
          font-weight: 600;
          font-size: 0.75rem;
        }

        > .args {
          margin: 0;
          background-color: hsla(0 0% 100% / 0.2);
          padding: 1em;
          border-radius: 6px;
          width: fit-content;
          max-width: 100%;
          overflow-x: auto;
          font-size: 0.85rem;
          cursor: text;
          user-select: text;

          > code {
            background: transparent;
            padding: 0;
          }
        }
      }
    }
  }
</style>
