<script lang="ts" setup>
import type { LabelProps } from '@stina/extension-api'

const props = defineProps<LabelProps>()
</script>

<template>
  <span class="extension-label">{{ props.text }}</span>
</template>
