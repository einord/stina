<script setup lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { computed, useSlots } from 'vue';

  const props = defineProps<{
    content?: string;
  }>();

  marked.setOptions({ gfm: true, breaks: true });

  const slots = useSlots();

  /**
   * Recursively extracts text content from slot VNodes.
   * Handles string, number, and array children for nested slot structures.
   */
  function extractSlotText(nodes = slots.default?.() ?? []): string {
    return nodes
      .map((node) => {
        if (typeof node.children === 'string') return node.children;
        if (typeof node.children === 'number') return String(node.children);
        if (Array.isArray(node.children)) return extractSlotText(node.children as typeof nodes);
        return '';
      })
      .join('');
  }

  const raw = computed(() => props.content ?? extractSlotText());

  const html = computed(() => {
    if (!raw.value) return '';
    const parsed = marked.parse(raw.value);
    return DOMPurify.sanitize(typeof parsed === 'string' ? parsed : '');
  });
</script>

<template>
  <div class="markdown" v-html="html"></div>
</template>

<style scoped>
  .markdown {
    display: block;
    color: inherit;
  }
  .markdown :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6) {
    margin: 0;
  }
  .markdown
    :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6)
    + :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6) {
    margin-top: 2em;
  }
  .markdown h1,
  .markdown h2,
  .markdown h3,
  .markdown h4,
  .markdown h5,
  .markdown h6 {
    font-weight: 700;
    line-height: 1.3;
  }
  .markdown ul,
  .markdown ol {
    padding-left: 1.4em;
  }
  .markdown blockquote {
    border-left: 3px solid var(--border);
    padding-left: 3em;
    color: var(--muted);
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
    padding: 2em 3em;
    overflow-x: auto;
    font-size: 0.9em;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }
  .markdown pre code {
    background: transparent;
    padding: 0;
  }
  .markdown a {
    color: inherit;
    text-decoration: underline;
  }
  .markdown hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 3em 0;
  }
  .markdown table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95em;
  }
  .markdown th,
  .markdown td {
    border: 1px solid var(--border);
    padding: 2em;
    text-align: left;
  }
  .markdown th {
    background: var(--bg-elev);
    font-weight: 600;
  }
</style>
