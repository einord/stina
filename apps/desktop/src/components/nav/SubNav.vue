<script setup lang="ts">
  import { computed } from 'vue';

  import NavButtonText from './NavButtonText.vue';

  export interface SubNavItem {
    id: string;
    label: string;
  }

  const modelValue = defineModel<string>({ required: true });
  const props = defineProps<{
    items: SubNavItem[];
    ariaLabel?: string;
  }>();

  const safeItems = computed(() => props.items ?? []);
</script>

<template>
  <nav class="sub-nav" :aria-label="ariaLabel">
    <NavButtonText
      v-for="item in safeItems"
      :key="item.id"
      v-model="modelValue"
      :value="item.id"
      :title="item.label"
    >
      {{ item.label }}
    </NavButtonText>
  </nav>
</template>

<style scoped>
  .sub-nav {
    width: 220px;
    background: var(--window-bg-lower);
    padding-top: 1rem;
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
</style>
