<script setup lang="ts">
import IconToggleButton from '../common/IconToggleButton.vue'
</script>

<template>
  <div class="chat-view">
    <div class="top-bar">söndag 21 december kl 21:45</div>
    <div class="chat-messages">
      <h1>Chat</h1>
    </div>
    <div class="input">
      <div class="toolbar">
        <IconToggleButton
          icon="chat-add-01"
          :tooltip="$t('chat.start_new_chat')"
          :disabled="disableNew"
          @click="() => {}"
        />
        <IconToggleButton icon="refresh" :tooltip="$t('chat.retry_last')" @click="() => {}" />
      </div>
      <textarea placeholder="Skriv till Stina..."></textarea>
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100%;

  > .top-bar {
    text-align: center;
    padding: 8px;
    font-size: 14px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  > .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  > .input {
    border-top: 1px solid var(--theme-general-border-color);
    padding: 0;
    position: relative;

    > .toolbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: 100%;
      height: 2rem;
      padding: 0.5rem 0.5rem;
      z-index: 1;
      pointer-events: none;

      > * {
        pointer-events: all;
      }
    }

    > textarea {
      border: none;
      width: 100%;
      padding: 3rem 1rem 1rem 1rem;
      font-size: 1em;
      color: var(--theme-main-components-chat-color);
      background: var(--theme-main-components-chat-input-background);

      &:focus {
        outline: none;
      }
    }
  }
}
</style>
