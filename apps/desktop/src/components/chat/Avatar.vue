<template>
  <div class="avatar" :title="alt">
    {{ label }}
    <span v-if="aborted" class="badge" title="Stopped">
      <svg class="badge-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M7 17 L17 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </span>
  </div>
</template>

<script setup lang="ts">
  withDefaults(defineProps<{ label?: string; alt?: string; aborted?: boolean }>(), { label: '🙂' });
</script>

<style scoped>
  .avatar {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    font-size: 16px;
  }
  .badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
  }
  .badge-icon {
    width: 14px;
    height: 14px;
    color: var(--muted);
  }
</style>
