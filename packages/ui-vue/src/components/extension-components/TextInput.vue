<script lang="ts" setup>
import type { TextInputProps } from '@stina/extension-api'

defineProps<TextInputProps>()

const emit = defineEmits<{
  action: [actionName: string, value: string]
}>()
</script>

<template>
  <label>
    {{ label }}
    <input
      type="text"
      :placeholder="placeholder"
      :value="value"
      @input="emit('action', onChangeAction, ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
