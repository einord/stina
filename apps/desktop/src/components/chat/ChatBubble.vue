<template>
  <div class="row" :class="role">
    <Avatar
      class="avatar"
      :label="avatar"
      :image-src="avatarImage"
      :alt="avatarAlt"
      :aborted="aborted"
      :imageOutside="imageOutside"
    />
    <div class="content" :class="role">
      <div class="bubble" :class="[role, { aborted }]">
        <slot>
          <MarkDown :content="text" />
        </slot>
      </div>
      <div v-if="timestampText" class="meta">
        <time :datetime="timestampIso || undefined">{{ timestampText }}</time>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ChatRole } from '@stina/store';
  import { computed } from 'vue';

  import MarkDown from '../MarkDown.vue';

  import Avatar from './Avatar.vue';

  const props = withDefaults(
    defineProps<{
      role?: ChatRole;
      text?: string;
      avatar?: string;
      aborted?: boolean;
      timestamp?: string;
      timestampIso?: string;
      avatarImage?: string;
      avatarAlt?: string;
      imageOutside?: boolean;
    }>(),
    {
      role: 'assistant',
      text: '',
      avatar: '🤖',
      timestamp: '',
      timestampIso: '',
      avatarImage: '',
      avatarAlt: 'Assistent',
      imageOutside: false,
    },
  );

  const timestampText = computed(() => props.timestamp?.trim() ?? '');
  const timestampIso = computed(() => props.timestampIso?.trim() ?? '');
</script>

<style scoped>
  .row {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 3em;
    align-items: end;
  }
  .row.user {
    grid-template-columns: 1fr 32px;
  }
  .row.user .avatar {
    order: 2;
  }
  .avatar {
    margin-bottom: 26px;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 1em;
    align-items: flex-start;
  }
  .content.user {
    align-items: flex-end;
    order: 1;
  }
  .bubble {
    max-width: 70ch;
    padding: 3em 4em;
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
  .meta {
    font-size: 0.5rem;
    color: var(--muted);
    text-align: left;
  }
  .content.user .meta {
    text-align: right;
  }
</style>
