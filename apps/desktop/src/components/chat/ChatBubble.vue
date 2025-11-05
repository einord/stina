<template>
  <div class="row" :class="role">
    <Avatar class="av" :label="avatar" />
    <div class="bubble" :class="role">
      <slot>{{ text }}</slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import Avatar from './Avatar.vue';

type Role = 'user' | 'assistant';
withDefaults(defineProps<{ role?: Role; text?: string; avatar?: string }>(), {
  role: 'assistant',
  text: '',
  avatar: '🤖',
});
</script>

<style scoped>
.row { display: grid; grid-template-columns: 32px 1fr; gap: var(--space-3); align-items: flex-end; }
.row.user { grid-template-columns: 1fr 32px; }
.row.user .av { order: 2; }
.row.user .bubble { order: 1; justify-self: end; }
.bubble {
  max-width: 70ch;
  padding: var(--space-3) var(--space-4);
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bubble-ai);
  color: var(--bubble-ai-text);
}
.bubble.user { background: var(--bubble-user); color: var(--bubble-user-text); }
</style>