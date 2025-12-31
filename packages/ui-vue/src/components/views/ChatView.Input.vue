<script setup lang="ts">
import { nextTick, ref, watch, inject } from 'vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import type { useChat } from './ChatView.service.js'

const MIN_ROWS = 1
const MAX_ROWS = 10

const chat = inject<ReturnType<typeof useChat>>('chat')!
if (!chat) {
  throw new Error('ChatView.Input: chat not provided')
}

const disabled = ref(false)
const textareaElement = ref<HTMLTextAreaElement>()

const text = ref<string>()
const rows = ref(MIN_ROWS)

watch(
  [() => text.value, textareaElement],
  async () => {
    const el = textareaElement.value
    if (!el) {
      rows.value = MIN_ROWS
      return
    }

    // Wait for DOM update with the updated scrollHeight size
    await nextTick()

    const style = getComputedStyle(el)
    const lineHeight = parseFloat(style.lineHeight)
    const paddingTop = parseFloat(style.paddingTop)
    const paddingBottom = parseFloat(style.paddingBottom)

    // 1) Reset height so scrollHeight can shrink
    const prevHeight = el.style.height
    el.style.height = '0px'

    // 2) Now measure actual content height
    const contentHeight = el.scrollHeight - paddingTop - paddingBottom
    const visualRows = Math.max(1, Math.ceil(contentHeight / lineHeight))

    // 3) Restore (optional, but keeps things tidy)
    el.style.height = prevHeight

    rows.value = Math.min(MAX_ROWS, Math.max(MIN_ROWS, visualRows))
  },
  { immediate: true }
)

async function submit() {
  const message = text.value?.trim()
  if (!message) return

  // Clear input immediately
  text.value = ''

  // Send message
  await chat.sendMessage(message)
}

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    // allow newline
    return
  }
  event.preventDefault()
  submit()
}

function startNewChat() {
  chat.startConversation()
}
</script>

<template>
  <div class="input">
    <div class="toolbar">
      <IconToggleButton
        icon="chat-add-01"
        :tooltip="$t('chat.start_new_chat')"
        :disabled="disabled"
        @click="startNewChat"
      />
      <IconToggleButton
        icon="refresh"
        :tooltip="$t('chat.retry_last')"
        :disabled="disabled"
        @click="() => {}"
      />
    </div>
    <textarea
      ref="textareaElement"
      v-model="text"
      :placeholder="$t('chat.input_placeholder')"
      :rows="rows"
      @keydown.enter="onEnter"
    ></textarea>
  </div>
</template>

<style scoped>
.input {
  padding: 0;
  display: flex;

  > .toolbar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    width: 100%;
    padding: 0.5rem 0.5rem;
    z-index: 1;
    pointer-events: none;
    background-color: var(--theme-main-components-chat-input-background);

    > * {
      pointer-events: all;
    }
  }

  > textarea {
    border: none;
    width: 100%;
    padding: 3rem 1rem 1rem 1rem;
    margin: 0;
    font: inherit;
    color: var(--theme-main-components-chat-color);
    background: var(--theme-main-components-chat-input-background);
    resize: none;
    overflow: auto;
    /* height: 100%; */

    &::-webkit-scrollbar {
      display: none;
    }

    &:focus {
      outline: none;
    }
  }
}
</style>
