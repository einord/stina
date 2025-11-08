<template>
  <div class="row" :class="role">
    <Avatar class="av" :label="avatar" :aborted="aborted" />
    <div class="bubble" :class="[role, { aborted }]">
      <slot>
        <div class="markdown" v-html="htmlText" />
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { computed } from 'vue';

  import Avatar from './Avatar.vue';

  type Role = 'user' | 'assistant';
  const props = withDefaults(
    defineProps<{ role?: Role; text?: string; avatar?: string; aborted?: boolean }>(),
    {
      role: 'assistant',
      text: '',
      avatar: '🤖',
    },
  );

  marked.setOptions({ gfm: true, breaks: true });

  const htmlText = computed(() => {
    const txt = props.text ?? '';
    if (!txt) return '';
    const parsed = marked.parse(txt);
    return DOMPurify.sanitize(typeof parsed === 'string' ? parsed : '');
  });
</script>

<style scoped>
  .row {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: var(--space-3);
    align-items: flex-end;
  }
  .row.user {
    grid-template-columns: 1fr 32px;
  }
  .row.user .av {
    order: 2;
  }
  .row.user .bubble {
    order: 1;
    justify-self: end;
  }
  .bubble {
    max-width: 70ch;
    padding: var(--space-3) var(--space-4);
    border-radius: 16px;
    border: 1px solid var(--border);
    background: var(--bubble-ai);
    color: var(--bubble-ai-text);
    line-height: 1.5;
    word-break: break-word;
  }
  .bubble.user {
    background: var(--bubble-user);
    color: var(--bubble-user-text);
  }
  .bubble.aborted {
    opacity: 0.7;
    border-style: dashed;
  }
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
