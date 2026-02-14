<script setup lang="ts">
import { provide, ref, computed, onMounted } from 'vue'
import type { NotificationSoundId } from '@stina/shared'
import ChatViewInput from './ChatView.Input.vue'
import ChatViewMessages from './ChatView.Messages.vue'
import ChatViewProcessing from './ChatView.Processing.vue'
import ChatViewToolConfirmation from './ChatView.ToolConfirmation.vue'
import { useChat } from './ChatView.service.js'
import { tryUseNotifications } from '../../composables/useNotifications.js'
import { useApi } from '../../composables/useApi.js'
import { useServerClock } from '../../composables/useServerClock.js'

const props = defineProps<{
  /** Start a fresh conversation on mount (used after onboarding) */
  startFresh?: boolean
}>()

const chatBackgroundUrl = 'none' // `url(${new URL('../../assets/chat-background.png', import.meta.url).href})`

const notifications = tryUseNotifications()
const api = useApi()
const { formattedDateTime } = useServerClock()

// Cache notification sound setting
const notificationSound = ref<NotificationSoundId>('default')

// Fetch notification settings once on mount
onMounted(async () => {
  try {
    const settings = await api.settings.get()
    notificationSound.value = settings.notificationSound
  } catch {
    // Keep default sound if settings fetch fails
  }
})

// Initialize chat (connects to API via SSE)
const chat = useChat({
  startFresh: props.startFresh,
  onInteractionSaved: async (interaction) => {
    if (!notifications) return

    // Find Stina's response message
    const stinaMessage = interaction.messages.find((m) => m.type === 'stina')
    if (!stinaMessage?.text) return

    // Skip if the message is a no-reply marker
    if (stinaMessage.text === '__STINA_NO_REPLY__') return

    // Show notification using cached sound setting
    void notifications.maybeShowNotification({
      title: 'Stina',
      body: stinaMessage.text,
      sound: notificationSound.value,
      clickAction: 'focus-chat',
    })
  },
  onBackgroundInstruction: async (interaction) => {
    if (!notifications) return

    // Find Stina's response message
    const stinaMessage = interaction.messages.find((m) => m.type === 'stina')
    if (!stinaMessage?.text) return

    // Skip if the message is a no-reply marker
    if (stinaMessage.text === '__STINA_NO_REPLY__') return

    // Show notification for background instructions (e.g., reminders)
    void notifications.maybeShowNotification({
      title: 'Stina',
      body: stinaMessage.text,
      sound: notificationSound.value,
      clickAction: 'focus-chat',
    })
  },
})

// Provide chat to child components
provide('chat', chat)

// Computed for pending confirmation
const hasPendingConfirmation = computed(() => chat.pendingConfirmation.value !== null)

function handleConfirmationResponse(response: { approved: boolean; denialReason?: string }) {
  chat.respondToConfirmation(response)
}
</script>

<template>
  <div class="chat-view">
    <div class="top-bar">{{ formattedDateTime }}</div>
    <ChatViewMessages class="messages" />
    <ChatViewProcessing />
    <ChatViewToolConfirmation
      v-if="hasPendingConfirmation && chat.pendingConfirmation.value"
      :tool-call="chat.pendingConfirmation.value.toolCall"
      @respond="handleConfirmationResponse"
    />
    <ChatViewInput v-else class="input" />
  </div>
</template>

<style scoped>
.chat-view {
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: 100%;
  background-image: v-bind(chatBackgroundUrl);
  background-repeat: repeat-y;
  background-blend-mode: color-burn;
  background-position: center bottom;
  height: 100%;
  max-height: 100%;
  max-width: 100%;
  overflow-y: hidden;
  overflow-x: hidden;

  > .top-bar {
    text-align: center;
    padding: 8px;
    font-size: 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    box-shadow: 0 0 2rem 2rem var(--theme-main-components-main-background);
    height: 0rem;
    overflow-y: visible;
    z-index: 1;
  }

  > .messages {
    flex: 1;
    overflow-y: auto;
  }

  > .input {
    border-top: 1px solid var(--theme-general-border-color);
    position: relative;
  }
}
</style>
