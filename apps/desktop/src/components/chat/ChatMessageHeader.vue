<script setup lang="ts"></script>

<template>
  <div class="header"><slot></slot></div>
</template>

<style scoped>
  .header {
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 1em;
    font-weight: 800;
    border-bottom: 2px dotted hsl(0 0% 100% / 0.5);
    width: fit-content;
    padding-left: 0.5em;
    padding-right: 0.5em;
    padding-bottom: 0.2em;
    margin-left: auto;
    margin-right: auto;
  }
</style>
