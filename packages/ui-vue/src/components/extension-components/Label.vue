<script lang="ts" setup>
import type { LabelProps } from '@stina/extension-api'

defineProps<LabelProps>()
</script>

<template>
  <label>{{ text }}</label>
</template>
