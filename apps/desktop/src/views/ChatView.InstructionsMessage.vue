<script setup lang="ts">
  import { InteractionMessage } from '@stina/chat';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <MarkDown class="instructions-message" :content="message.content" />
</template>

<style scoped>
  .instructions-message {
    background-color: green;
  }
</style>
