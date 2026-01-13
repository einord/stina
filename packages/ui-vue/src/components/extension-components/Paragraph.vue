<script lang="ts" setup>
import type { ParagraphProps } from '@stina/extension-api'

const props = defineProps<ParagraphProps>()
</script>

<template>
  <p>{{ props.text }}</p>
</template>
