<script setup lang="ts">
  import { getLocaleForFormatting, useTimeZone } from '../lib/localization';
  import { onMounted, onUnmounted, ref } from 'vue';

  const locale = getLocaleForFormatting();
  const timeZone = useTimeZone();
  const headerDate = ref('');

  const updateHeaderDate = () => {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: timeZone.value,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: 'numeric',
    });
    headerDate.value = formatter.format(new Date());
  };

  // Update the header date every second
  const intervalId = setInterval(updateHeaderDate, 1000);
  onMounted(updateHeaderDate);
  onUnmounted(() => clearInterval(intervalId));
</script>

<template>
  <div class="head">{{ headerDate }}</div>
</template>

<style scoped>
  .head {
    text-align: center;
    color: var(--muted);
    padding: 1em;
    font-size: 0.75rem;
  }
</style>
