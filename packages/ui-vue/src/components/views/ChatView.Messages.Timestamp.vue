<script setup lang="ts">
import { computed } from 'vue'
import { useRelativeTime } from '../../composables/useRelativeTime.js'

const props = defineProps<{
  /** ISO timestamp string (e.g. interaction.metadata.createdAt) */
  timestamp: string | undefined
}>()

const label = useRelativeTime(() => props.timestamp)

// Full, locale-formatted timestamp shown on hover for precision
const fullLabel = computed(() => {
  if (!props.timestamp) return ''
  const date = new Date(props.timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
})
</script>

<template>
  <time v-if="label" class="chat-timestamp" :datetime="timestamp" :title="fullLabel">
    {{ label }}
  </time>
</template>

<style scoped>
.chat-timestamp {
  display: block;
  text-align: center;
  font-size: 0.75rem;
  color: var(--muted);
  opacity: 0.55;
  font-weight: var(--font-weight-light);
  padding: 0.25rem 1rem 0;
  user-select: none;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
}
</style>
