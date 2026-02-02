<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { useChat } from './ChatView.service.js'
import type { ToolCall } from '@stina/chat'
import SimpleButton from '../buttons/SimpleButton.vue'
import ToolCallBadge from '../common/ToolCallBadge.vue'
import TextInput from '../inputs/TextInput.vue'

const chat = inject<ReturnType<typeof useChat>>('chat')!
if (!chat) {
  throw new Error('ChatView.ToolConfirmation: chat not provided')
}

const props = defineProps<{
  toolCall: ToolCall
}>()

const emit = defineEmits<{
  respond: [response: { approved: boolean; denialReason?: string }]
}>()

const customMessage = ref('')

const toolName = computed(() => props.toolCall.displayName || props.toolCall.name)
const prompt = computed(() => props.toolCall.confirmationPrompt || '')

function approve() {
  emit('respond', { approved: true })
}

function deny() {
  const reason = customMessage.value.trim() || undefined
  emit('respond', { approved: false, denialReason: reason })
}
</script>

<template>
  <div class="tool-confirmation">
    <div class="prompt">
      <h3>{{ prompt || $t('chat.tool_confirmation.default_prompt', { toolName }) }}</h3>
    </div>

    <div class="content">
      <div class="header">
        {{ $t('chat.tool_confirmation.title') }}
      </div>
      <ToolCallBadge :tool="toolCall" :show-output="false" />
    </div>

    <div class="actions">
      <SimpleButton @click="approve">{{ $t('chat.tool_confirmation.yes') }}</SimpleButton>
      <SimpleButton @click="deny">{{ $t('chat.tool_confirmation.no') }}</SimpleButton>
      <TextInput
        v-model="customMessage"
        :placeholder="$t('chat.tool_confirmation.custom_response_placeholder')"
        @keydown.enter.prevent="deny"
      />
    </div>
  </div>
</template>

<style scoped>
.tool-confirmation {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: var(--theme-main-components-chat-tool-confirmation-background);
  border-top: 1px solid var(--theme-general-border-color);

  > .content {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 1rem;
  }

  > .actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
}
</style>
