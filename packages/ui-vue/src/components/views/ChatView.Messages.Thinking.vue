<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue'
import MarkDown from '../common/MarkDown.vue'

const props = defineProps<{
  message: string
  showContent: boolean
}>()

const overrideShowContent = ref(props.showContent)

watchEffect(() => {
  overrideShowContent.value = props.showContent
})

const toggleLabel = computed(() =>
  overrideShowContent.value ? 'Hide thinking' : 'Show thinking',
)
</script>

<template>
  <div class="thinking">
    <button
      class="icon-button"
      :aria-label="toggleLabel"
      :title="toggleLabel"
      @click="overrideShowContent = !overrideShowContent"
    >
      <Icon name="bubble-chat" class="icon" />
    </button>
    <MarkDown v-if="overrideShowContent" class="content" :content="message" />
  </div>
</template>

<style scoped>
.thinking {
  border: 1px solid var(--secondary);
  padding: 0;
  background-color: hsla(0, 0%, 100%, 0.05);
  font-size: 0.85rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  color: var(--theme-general-color-muted);

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
    font-family: monospace;
    flex: 1 1;
    padding: 0 2rem 1rem 2rem;
  }
}
</style>
