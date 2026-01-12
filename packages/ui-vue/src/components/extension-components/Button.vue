<script lang="ts" setup>
import type { ButtonProps, ExtensionActionRef } from '@stina/extension-api'

const props = defineProps<ButtonProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef]
}>()
</script>

<template>
  <button @click="emit('action', props.onClickAction)">{{ props.text }}</button>
</template>
