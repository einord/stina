<script setup lang="ts"></script>

<template>
  <div class="markdown">
    <slot></slot>
  </div>
</template>

<style scoped>
  .markdown {
    display: block;
  }
  .markdown :is(p, ul, ol, pre, blockquote) {
    margin: 0;
  }
  .markdown :is(p, ul, ol, pre, blockquote) + :is(p, ul, ol, pre, blockquote) {
    margin-top: var(--space-2);
  }
  .markdown ul,
  .markdown ol {
    padding-left: 1.4em;
  }
  .markdown code {
    background: var(--panel);
    border-radius: 4px;
    padding: 0 4px;
    font-size: 0.9em;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }
  .markdown pre {
    background: var(--panel);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    overflow-x: auto;
    font-size: 0.9em;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }
  .markdown a {
    color: inherit;
    text-decoration: underline;
  }
</style>
