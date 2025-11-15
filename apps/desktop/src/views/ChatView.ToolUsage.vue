<script setup lang="ts">
  import { InteractionMessage } from '@stina/store';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="tool-usage">
    <div>Verktyg:</div>
    {{ message.content }}
  </div>
</template>

<style scoped>
  .tool-usage {
  }
</style>
