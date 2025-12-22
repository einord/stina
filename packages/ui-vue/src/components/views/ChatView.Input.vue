<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import IconToggleButton from '../common/IconToggleButton.vue'

const MIN_ROWS = 1
const MAX_ROWS = 10

const disabled = ref(false) // TODO
const textareaElement = ref<HTMLTextAreaElement>()

const text = ref()
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

function onEnter(event: KeyboardEvent) {
  if (event.shiftKey || event.ctrlKey || event.metaKey) {
    // allow newline
    return
  }
  event.preventDefault()
  // submit() // TODO
  text.value = undefined
}
</script>

<template>
  <div class="input">
    <div class="toolbar">
      <IconToggleButton
        icon="chat-add-01"
        :tooltip="$t('chat.start_new_chat')"
        :disabled="disabled"
        @click="() => {}"
      />
      <IconToggleButton icon="refresh" :tooltip="$t('chat.retry_last')" @click="() => {}" />
    </div>
    <textarea
      ref="textareaElement"
      v-model="text"
      placeholder="Skriv till Stina..."
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
