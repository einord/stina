<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed, useSlots } from 'vue'

const props = withDefaults(
  defineProps<{
    content?: string
    /**
     * Enable strict mode for untrusted content (e.g., from extensions).
     * Blocks images, iframes, forms, and forces links to open in new tabs.
     */
    strict?: boolean
  }>(),
  { content: undefined, strict: false }
)

marked.setOptions({ gfm: true, breaks: true })

const slots = useSlots()

/**
 * Recursively extracts text content from slot VNodes.
 * Handles string, number, and array children for nested slot structures.
 */
function extractSlotText(nodes = slots['default']?.() ?? []): string {
  return nodes
    .map((node) => {
      if (typeof node.children === 'string') return node.children
      if (typeof node.children === 'number') return String(node.children)
      if (Array.isArray(node.children)) return extractSlotText(node.children as typeof nodes)
      return ''
    })
    .join('')
}

/**
 * Strict sanitization config for untrusted content.
 * Blocks potentially dangerous elements and attributes.
 * Forces links to open in new tabs with security attributes.
 */
const STRICT_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'del',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'hr',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
  ],
  ALLOWED_ATTR: ['href'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'img', 'svg', 'object', 'embed'],
  FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
  ADD_ATTR: ['target', 'rel'],
  HOOKS: {
    afterSanitizeAttributes: (node: Element) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    },
  },
}

const raw = computed(() => props.content ?? extractSlotText())

const html = computed(() => {
  const content = raw.value?.trim()
  if (!content) return ''
  const parsed = marked.parse(content)
  const config = props.strict ? STRICT_SANITIZE_CONFIG : undefined
  return DOMPurify.sanitize(typeof parsed === 'string' ? parsed : '', config)
})
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="markdown" v-html="html"></div>
</template>

<style scoped>
.markdown {
  display: block;
  line-height: 1.7;

  > :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6) {
    margin: 0;

    + :is(p, ul, ol, pre, blockquote, table, h1, h2, h3, h4, h5, h6) {
      margin-top: 1.5rem;
    }
  }

  > :is(h1, h2, h3, h4, h5, h6) {
    font-weight: 700;
    line-height: 1.3;
  }

  > ul,
  > ol {
    padding-left: 1.5rem;
  }

  > blockquote {
    border-left: 3px solid var(--theme-general-border-color, hsl(214, 13%, 32%));
    padding-left: 1.25rem;
    color: var(--theme-general-color-muted, #9ca3af);
  }

  a {
    color: var(--theme-general-color, hsl(210, 15%, 75%));
    text-decoration: underline;

    &:hover {
      color: var(--theme-general-color-hover, #c09539);
    }
  }

  code {
    background: var(--theme-components-button-background, hsl(216, 34%, 12%));
    border-radius: 4px;
    padding: 0 0.35rem;
    font-size: 0.9em;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }

  > pre {
    background: var(--theme-main-components-main-background, hsl(270, 75%, 6%));
    border: 1px solid var(--theme-general-border-color, hsl(214, 13%, 32%));
    border-radius: 6px;
    padding: 1.25rem 1.5rem;
    overflow-x: auto;
    font-size: 0.9em;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;

    > code {
      background: transparent;
      padding: 0;
      border-radius: 0;
    }
  }

  > hr {
    border: none;
    border-top: 1px solid var(--theme-general-border-color, hsl(214, 13%, 32%));
    margin: 2rem 0;
  }

  > table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
    color: var(--theme-general-color, hsl(210, 15%, 75%));

    > :is(thead, tbody, tfoot) > tr > :is(th, td) {
      border: 1px solid var(--theme-general-border-color, hsl(214, 13%, 32%));
      padding: 0.75rem 0.875rem;
      text-align: left;
    }

    > thead > tr > th {
      background: var(--theme-components-button-background-hover, hsl(216, 34%, 16%));
      font-weight: 600;
    }
  }
}
</style>
