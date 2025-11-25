<script setup lang="ts"></script>

<template>
  <div class="header"><slot></slot></div>
</template>

<style scoped>
  .header {
    font-size: var(--font-size-sm);
    color: var(--text-muted);
    margin-bottom: var(--space-1);
    font-weight: 800;
  }
</style>
