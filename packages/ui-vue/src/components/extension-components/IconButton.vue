<script lang="ts" setup>
import type { IconButtonProps, ExtensionActionRef } from '@stina/extension-api'
import IconToggleButton from '../buttons/IconToggleButton.vue'

const props = defineProps<IconButtonProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef]
}>()
</script>

<template>
  <IconToggleButton
    :icon="props.icon"
    :tooltip="props.tooltip"
    :active="props.active"
    :disabled="props.disabled"
    :type="props.type"
    @click="emit('action', props.onClickAction)"
  />
</template>
