<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolCall } from '@stina/chat'
import Icon from './Icon.vue'
import Modal from './Modal.vue'
import CodeBlock from './CodeBlock.vue'
import { useI18n } from '../../composables/useI18n.js'

const { t: $t } = useI18n()

const props = withDefaults(
  defineProps<{
    tool: ToolCall
    showOutput?: boolean
  }>(),
  {
    showOutput: true,
  }
)

const showModal = ref(false)

const payloadValue = computed(() => {
  try {
    const emptyPayload =
      props.tool.payload === null || props.tool.payload === '' || props.tool.payload === '{}'

    return emptyPayload
      ? $t('chat.tool_no_input')
      : JSON.stringify(JSON.parse(props.tool.payload || '{}'), null, 2)
  } catch {
    return props.tool.payload || ''
  }
})
</script>

<template>
  <button type="button" class="tool-call-badge" @click="showModal = true">
    <Icon name="wrench-01" />
    {{ tool.displayName || tool.name }}
  </button>

  <Modal
    v-model="showModal"
    :title="tool.displayName || tool.name"
    :close-label="$t('common.close')"
    max-width="800px"
  >
    <div class="tool-details">
      <CodeBlock :content="payloadValue" :label="$t('chat.tool_input')" />
      <CodeBlock v-if="showOutput" :content="tool.result" :label="$t('chat.tool_output')" />
    </div>
  </Modal>
</template>

<style scoped>
.tool-call-badge {
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

.tool-details {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
