<script lang="ts" setup>
import type { TextInputProps, ExtensionActionRef } from '@stina/extension-api'

const props = defineProps<TextInputProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef, value: string]
}>()
</script>

<template>
  <label>
    {{ props.label }}
    <input
      type="text"
      :placeholder="props.placeholder"
      :value="props.value"
      @input="emit('action', props.onChangeAction, ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
