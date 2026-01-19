<script setup lang="ts">
import { ref } from 'vue'
import type { ToolCall } from '@stina/chat'
import Icon from '../common/Icon.vue'
import Modal from '../common/Modal.vue'

defineProps<{
  tools: ToolCall[]
}>()

const showModal = ref(false)
const selectedTool = ref<ToolCall | null>(null)

/**
 * Opens the modal to display details for a specific tool call.
 */
function openToolDetails(tool: ToolCall): void {
  selectedTool.value = tool
  showModal.value = true
}

/**
 * Formats a JSON string for display, with pretty-printing if valid JSON.
 */
function formatJson(str: string | undefined): string {
  if (!str) return ''
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
</script>

<template>
  <div class="tools">
    <button
      v-for="tool in tools"
      :key="tool.name"
      type="button"
      class="tool"
      @click="openToolDetails(tool)"
    >
      <Icon name="wrench-01" />
      {{ tool.displayName || tool.name }}
    </button>

    <Modal
      v-model="showModal"
      :title="selectedTool?.displayName || selectedTool?.name || ''"
      :close-label="$t('common.close')"
      max-width="800px"
    >
      <div class="tool-details">
        <section class="payload">
          <h3>{{ $t('chat.tool_input') }}</h3>
          <pre>{{ formatJson(selectedTool?.payload) }}</pre>
        </section>
        <section class="result">
          <h3>{{ $t('chat.tool_output') }}</h3>
          <pre>{{ formatJson(selectedTool?.result) }}</pre>
        </section>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 1rem;
  justify-content: center;
  align-items: start;

  > .tool {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 0.5em;
    border: 1px solid var(--theme-main-components-chat-tool-color);
    border-radius: 0.75rem;
    padding: 0.5rem;
    background: var(--theme-main-components-chat-tool-background);
    cursor: pointer;
    color: var(--theme-main-components-chat-tool-color);
    text-align: left;
    font-size: 0.75rem;
    font-weight: bold;

    &:hover {
      opacity: 0.8;
    }
  }
}

.tool-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  > .payload,
  > .result {
    > h3 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--theme-general-text-muted);
    }

    > pre {
      font-family: monospace;
      font-size: 0.8rem;
      background: var(--theme-general-code-background, #1e1e2e);
      color: var(--theme-general-code-color, #cdd6f4);
      padding: 1rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
      margin: 0;
    }
  }
}
</style>
