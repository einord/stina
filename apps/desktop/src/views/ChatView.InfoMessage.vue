<script setup lang="ts">
  import { InteractionMessage } from '@stina/store';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="info-message">
    {{ message.content }}
  </div>
</template>

<style scoped>
  .info-message {
  }
</style>
