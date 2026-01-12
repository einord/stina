<script lang="ts" setup>
import type { ParagraphProps } from '@stina/extension-api'

defineProps<ParagraphProps>()
</script>

<template>
  <p>{{ text }}</p>
</template>
