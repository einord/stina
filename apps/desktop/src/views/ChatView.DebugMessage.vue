<script setup lang="ts">
  import { InteractionMessage } from '@stina/store';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <MarkDown class="debug-message" v-html="message.content"></MarkDown>
</template>

<style scoped>
  .debug-message {
  }
</style>
