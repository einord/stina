<script setup lang="ts">
  import { InteractionMessage } from '@stina/store';

  import MarkDown from '../components/MarkDown.vue';

  defineProps<{
    message: InteractionMessage;
  }>();
</script>

<template>
  <div class="user-message">
    <div>Du:</div>
    <MarkDown>{{ message.content }}</MarkDown>
  </div>
</template>

<style scoped>
  .user-message {
  }
</style>
