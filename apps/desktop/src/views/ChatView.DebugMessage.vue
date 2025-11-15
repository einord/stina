<script setup lang="ts">
  import { InteractionMessage } from '@stina/store';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="debug-message">
    <div>Debug:</div>
    <MarkDown v-html="message.content"></MarkDown>
  </div>
</template>

<style scoped>
  .debug-message {
  }
</style>
