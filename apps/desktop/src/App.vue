<template>
  <main>
    <h1>Hello world – Stina</h1>
    <p>Count: <strong>{{ count }}</strong></p>
    <button @click="add">Add</button>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const count = ref<number>(0);

function add() {
  console.log('[renderer] click add');
  // @ts-ignore preload injected
  window.stina.increment(1);
}

onMounted(async () => {
  // @ts-ignore preload injected
  count.value = await window.stina.getCount();
  // @ts-ignore preload injected
  window.stina.onCountChanged((c: number) => (count.value = c));
});
</script>

<style>
main {
  padding: 2rem;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Noto Sans', 'Helvetica Neue', Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
}
button {
  padding: 0.5rem 0.75rem;
}
</style>