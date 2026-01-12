<script lang="ts" setup>
import type { CheckboxProps } from '@stina/extension-api'

defineProps<CheckboxProps>()

const emit = defineEmits<{
  action: [actionName: string, checked: boolean]
}>()
</script>

<template>
  <label>
    <input
      type="checkbox"
      :checked="checked"
      @change="emit('action', onChangeAction, ($event.target as HTMLInputElement).checked)"
    />
    {{ label }}
  </label>
</template>
