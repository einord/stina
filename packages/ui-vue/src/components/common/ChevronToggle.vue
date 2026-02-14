<script lang="ts" setup>
import Icon from './Icon.vue'

withDefaults(
  defineProps<{
    expanded?: boolean
    size?: string
  }>(),
  { expanded: false, size: '1em' }
)
</script>

<template>
  <Icon class="chevron-toggle" :class="{ expanded }" :style="{ fontSize: size }" name="arrow-down-01" />
</template>

<style scoped>
.chevron-toggle {
  transition: transform 0.2s ease;
  flex-shrink: 0;

  &.expanded {
    transform: rotate(180deg);
  }
}
</style>
