<script lang="ts" setup>
import type { SelectProps, ExtensionActionRef } from '@stina/extension-api'

const props = defineProps<SelectProps>()

const emit = defineEmits<{
  action: [action: ExtensionActionRef, value: string]
}>()
</script>

<template>
  <label>
    {{ props.label }}
    <select
      :value="props.selectedValue"
      @change="emit('action', props.onChangeAction, ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in props.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
