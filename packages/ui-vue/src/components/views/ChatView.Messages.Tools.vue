<script setup lang="ts">
import { ref } from 'vue'
import type { ToolCall } from '@stina/chat'
import Icon from '../common/Icon.vue'
import Modal from '../common/Modal.vue'
import CodeBlock from '../common/CodeBlock.vue'

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
        <CodeBlock :content="selectedTool?.payload" :label="$t('chat.tool_input')" />
        <CodeBlock :content="selectedTool?.result" :label="$t('chat.tool_output')" />
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
}
</style>
