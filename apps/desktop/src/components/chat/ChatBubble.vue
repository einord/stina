<template>
  <div class="row" :class="role">
    <Avatar class="av" :label="avatar" :aborted="aborted" />
    <div class="content" :class="role">
      <div class="bubble" :class="[role, { aborted }]">
        <slot>
          <div class="markdown" v-html="htmlText" />
        </slot>
      </div>
      <div v-if="timestampText" class="meta">
        <time :datetime="timestampIso || undefined">{{ timestampText }}</time>
      </div>
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
    defineProps<{
      role?: Role;
      text?: string;
      avatar?: string;
      aborted?: boolean;
      timestamp?: string;
      timestampIso?: string;
    }>(),
    {
      role: 'assistant',
      text: '',
      avatar: '🤖',
      timestamp: '',
      timestampIso: '',
    },
  );

  marked.setOptions({ gfm: true, breaks: true });

  const htmlText = computed(() => {
    const txt = props.text ?? '';
    if (!txt) return '';
    const parsed = marked.parse(txt);
    return DOMPurify.sanitize(typeof parsed === 'string' ? parsed : '');
  });

  const timestampText = computed(() => props.timestamp?.trim() ?? '');
  const timestampIso = computed(() => props.timestampIso?.trim() ?? '');
</script>

<style scoped>
  .row {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: var(--space-3);
    align-items: flex-start;
  }
  .row.user {
    grid-template-columns: 1fr 32px;
  }
  .row.user .av {
    order: 2;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: flex-start;
  }
  .content.user {
    align-items: flex-end;
    order: 1;
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
  .meta {
    font-size: var(--text-xs);
    color: var(--muted);
    text-align: left;
  }
  .content.user .meta {
    text-align: right;
  }
</style>
