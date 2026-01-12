<script lang="ts" setup>
import type { ButtonProps } from '@stina/extension-api'

defineProps<ButtonProps>()

const emit = defineEmits<{
  action: [actionName: string]
}>()
</script>

<template>
  <button @click="emit('action', onClickAction)">{{ text }}</button>
</template>
