<script setup lang="ts">
/**
 * Reusable component for displaying code/JSON content with optional collapsible summary.
 * Used for tool parameters, tool results, and other code displays.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** The code content to display */
    content: string | Record<string, unknown> | undefined
    /** Optional label/title shown above the code block */
    label?: string
    /** If true, wraps content in a collapsible <details> element */
    collapsible?: boolean
    /** Maximum height before scrolling (CSS value) */
    maxHeight?: string
  }>(),
  {
    label: undefined,
    collapsible: false,
    maxHeight: '300px',
  }
)

/**
 * Format content for display, with pretty-printing if it's JSON or an object
 */
const formattedContent = computed(() => {
  if (!props.content) return ''

  // If it's already an object, stringify it
  if (typeof props.content === 'object') {
    return JSON.stringify(props.content, null, 2)
  }

  // If it's a string, try to parse and re-format as JSON
  try {
    return JSON.stringify(JSON.parse(props.content), null, 2)
  } catch {
    return props.content
  }
})
</script>

<template>
  <div class="code-block">
    <!-- Collapsible mode -->
    <details v-if="collapsible && label">
      <summary>{{ label }}</summary>
      <pre :style="{ maxHeight }">{{ formattedContent }}</pre>
    </details>

    <!-- Non-collapsible mode -->
    <template v-else>
      <h3 v-if="label" class="label">{{ label }}</h3>
      <pre :style="{ maxHeight }">{{ formattedContent }}</pre>
    </template>
  </div>
</template>

<style scoped>
.code-block {
  > .label {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-general-text-muted, var(--theme-general-color-muted));
  }

  > pre,
  > details > pre {
    font-family: var(--font-mono, monospace);
    font-size: 0.75rem;
    background: var(--theme-general-code-background, var(--theme-general-background, #1e1e2e));
    color: var(--theme-general-code-color, var(--theme-general-color, #cdd6f4));
    padding: 0.75rem;
    border-radius: var(--border-radius-small, 0.375rem);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-y: auto;
    margin: 0;
  }

  > details {
    > summary {
      cursor: pointer;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--theme-general-color-muted);
      padding: 0.25rem 0;

      &:hover {
        color: var(--theme-general-color);
      }
    }

    > pre {
      margin-top: 0.5rem;
    }
  }
}
</style>
