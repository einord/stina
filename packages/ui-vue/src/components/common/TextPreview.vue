<script lang="ts" setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import MarkDown from './MarkDown.vue'
import ChevronToggle from './ChevronToggle.vue'

const props = withDefaults(
  defineProps<{
    content: string
    maxLines?: number
    strict?: boolean
  }>(),
  { maxLines: 5, strict: false }
)

const isExpanded = ref(false)
const isTruncated = ref(false)
const contentRef = ref<HTMLElement | null>(null)

function checkTruncation() {
  const el = contentRef.value
  if (!el) return
  isTruncated.value = el.scrollHeight > el.clientHeight
}

onMounted(() => {
  nextTick(checkTruncation)
})

watch(() => props.content, () => {
  nextTick(checkTruncation)
})

function toggle() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div class="text-preview">
    <div ref="contentRef" class="text-preview-content" :class="{ clamped: !isExpanded }"
      :style="{ '--max-lines': props.maxLines }">
      <MarkDown :content="props.content" :strict="props.strict" />
    </div>
    <button v-if="isTruncated || isExpanded" type="button" class="toggle-button" @click="toggle">
      <ChevronToggle :expanded="isExpanded" />
    </button>
  </div>
</template>

<style scoped>
.text-preview {
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
}

.text-preview-content {
  &.clamped {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    line-clamp: var(--max-lines, 5);
    -webkit-line-clamp: var(--max-lines, 5);
    overflow: hidden;
  }
}

.toggle-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--theme-general-color-muted);
  transition: color 0.15s ease;

  &:hover {
    color: var(--theme-general-color);
  }

  >.chevron-toggle {
    font-size: 1rem;
  }
}
</style>
