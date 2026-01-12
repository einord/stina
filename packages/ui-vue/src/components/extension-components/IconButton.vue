<script lang="ts" setup>
import type { IconButtonProps } from '@stina/extension-api'
import IconToggleButton from '../buttons/IconToggleButton.vue'

defineProps<IconButtonProps>()

const emit = defineEmits<{
  action: [actionName: string]
}>()
</script>

<template>
  <IconToggleButton
    :icon="icon"
    :tooltip="tooltip"
    :active="active"
    :disabled="disabled"
    :type="type"
    @click="emit('action', onClickAction)"
  />
</template>
