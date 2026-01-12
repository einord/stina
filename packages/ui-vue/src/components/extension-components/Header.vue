<script lang="ts" setup>
import type { HeaderProps } from '@stina/extension-api'

const props = defineProps<HeaderProps>()
</script>

<template>
  <header class="extension-header">
    <component :is="`h${props.level}`">
      {{ props.title }}
    </component>
  </header>
</template>

<style scoped>
.extension-header {
}
</style>
