<script setup lang="ts">
import { ref, computed } from 'vue'
import MarkDown from '../common/MarkDown.vue'

defineProps<{
  message: string
  isActive: boolean
}>()

const showContent = ref(false)

const toggleLabel = computed(() => (showContent.value ? 'Hide thinking' : 'Show thinking'))
</script>

<template>
  <div class="thinking">
    <button
      class="icon-button"
      :class="{ pulse: isActive }"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="showContent = !showContent"
    >
      <Icon name="bubble-chat" class="icon" />
    </button>
    <div class="content" :class="{ active: isActive, collapsed: !showContent }">
      <MarkDown class="markdown" :content="message" />
    </div>
  </div>
</template>

<style scoped>
.thinking {
  border: 1px solid var(--secondary);
  padding: 0;
  background-color: var(--theme-main-components-chat-thinking-background);
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  color: var(--theme-main-components-chat-thinking-color);

  > button {
    padding: 0.5rem 1rem;
    margin: 0;
    border: none;
    cursor: pointer;
    color: var(--theme-general-color-muted);
    background-color: transparent;
    height: 2.5rem;
    width: auto;
    display: grid;
    place-items: center;
    font-size: 1.25rem;

    > .icon {
      margin: 0;
      padding: 0;
    }
  }

  > .content {
    height: auto;
    overflow: hidden;
    align-content: end;
    position: relative;
    transition: height 0.3s ease;

    &.collapsed {
      height: 0;
      &::after {
        height: 1.5em;
      }
    }

    &.active.collapsed {
      height: 6em;
    }

    ::after {
      content: '';
      display: block;
      position: absolute;
      top: 0;
      width: 100%;
      pointer-events: none;
      height: 0;
      background: linear-gradient(
        to bottom,
        var(--theme-main-components-chat-thinking-background) 0%,
        transparent 100%
      );

      transition: height 0.3s ease;
    }

    > .markdown {
      font-family: monospace;
      flex: 1 1;
      padding: 0 2rem 1rem 2rem;
    }
  }
}
</style>
