<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { useChat } from './ChatView.service.js'
import type { ToolCall } from '@stina/chat'
import SimpleButton from '../buttons/SimpleButton.vue'
import Icon from '../common/Icon.vue'

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
const showDetails = ref(false)

const toolName = computed(() => props.toolCall.displayName || props.toolCall.name)
const prompt = computed(() => props.toolCall.confirmationPrompt || '')

const parsedPayload = computed(() => {
  try {
    return JSON.parse(props.toolCall.payload || '{}')
  } catch {
    return {}
  }
})

function approve() {
  emit('respond', { approved: true })
}

function deny() {
  const reason = customMessage.value.trim() || undefined
  emit('respond', { approved: false, denialReason: reason })
}

function toggleDetails() {
  showDetails.value = !showDetails.value
}
</script>

<template>
  <div class="tool-confirmation">
    <div class="prompt">
      <h3>{{ prompt || $t('chat.tool_confirmation.default_prompt', { toolName }) }}</h3>
    </div>

    <div class="content">
      <div class="tool-info">
        <span class="tool-name" @click="toggleDetails"
          ><Icon name="wrench-01" />{{ toolName }}</span
        >
      </div>

      <div v-if="showDetails" class="details">
        <pre>{{ JSON.stringify(parsedPayload, null, 2) }}</pre>
      </div>
    </div>

    <div class="header">
      <h3>{{ $t('chat.tool_confirmation.title') }}</h3>
    </div>

    <div class="actions">
      <SimpleButton @click="approve">{{ $t('chat.tool_confirmation.yes') }}</SimpleButton>
      <SimpleButton @click="deny">{{ $t('chat.tool_confirmation.no') }}</SimpleButton>
      <div class="custom-message">
        <input
          v-model="customMessage"
          type="text"
          :placeholder="$t('chat.tool_confirmation.custom_response_placeholder')"
          @keydown.enter.prevent="deny"
        />
      </div>
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

  > .header {
    > h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: var(--theme-main-components-chat-color);
    }
  }

  > .content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;

    > .prompt {
      margin: 0;
      font-size: 0.95rem;
      color: var(--theme-main-components-chat-color);
    }

    > .tool-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;

      > .tool-name {
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
      }

      > .toggle-details {
        border: none;
        background: transparent;
        color: var(--accent);
        cursor: pointer;
        font-size: 0.85rem;
        padding: 0.25rem 0.5rem;

        &:hover {
          text-decoration: underline;
        }
      }
    }

    > .details {
      background: var(--theme-general-background-secondary);
      border-radius: 6px;
      padding: 0.75rem;
      overflow-x: auto;

      > pre {
        margin: 0;
        font-size: 0.8rem;
        color: var(--theme-main-components-chat-color);
        white-space: pre-wrap;
        word-break: break-word;
      }
    }
  }

  > .actions {
    display: flex;
    gap: 0.5rem;

    > button {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 6px;
      font: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      transition: opacity 0.15s;

      &:hover {
        opacity: 0.9;
      }
    }

    > .btn-deny {
      background: var(--theme-general-background-secondary);
      color: var(--theme-main-components-chat-color);
      border: 1px solid var(--theme-general-border-color);
    }

    > .btn-approve {
      background: var(--accent);
      color: white;
    }

    > .custom-message {
      flex: 1 1;
      > input {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--theme-general-border-color);
        border-radius: 6px;
        font: inherit;
        font-size: 0.9rem;
        background: var(--theme-general-background);
        color: var(--theme-main-components-chat-color);

        &:focus {
          outline: none;
          border-color: var(--accent);
        }

        &::placeholder {
          color: var(--muted);
        }
      }
    }
  }
}
</style>
