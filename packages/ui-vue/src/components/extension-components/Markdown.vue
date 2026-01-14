<script lang="ts" setup>
import type { MarkdownProps } from '@stina/extension-api'
import MarkDown from '../common/MarkDown.vue'

const props = defineProps<MarkdownProps>()
</script>

<template>
  <MarkDown class="extension-markdown" :content="props.content" strict />
</template>

<style scoped>
.extension-markdown {
  color: var(--theme-components-markdown-color);

  :deep(> blockquote) {
    border-left-color: var(--theme-components-markdown-blockquote-border-color);
    color: var(--theme-components-markdown-color-muted);
  }

  :deep(code) {
    background: var(--theme-components-markdown-code-background);
  }

  :deep(> pre) {
    background: var(--theme-components-markdown-pre-background);
    border-color: var(--theme-components-markdown-pre-border-color);
  }

  :deep(> hr) {
    border-top-color: var(--theme-components-markdown-hr-color);
  }

  :deep(> table) {
    :is(th, td) {
      border-color: var(--theme-components-markdown-table-border-color);
    }

    th {
      background: var(--theme-components-markdown-table-header-background);
    }
  }

  :deep(a) {
    color: var(--theme-components-markdown-link-color);

    &:hover {
      color: var(--theme-components-markdown-link-color-hover);
    }
  }
}
</style>
