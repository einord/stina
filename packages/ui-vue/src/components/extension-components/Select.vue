<script lang="ts" setup>
import type { SelectProps } from '@stina/extension-api'

defineProps<SelectProps>()

const emit = defineEmits<{
  action: [actionName: string, value: string]
}>()
</script>

<template>
  <label>
    {{ label }}
    <select
      :value="selectedValue"
      @change="emit('action', onChangeAction, ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
