<script lang="ts" setup>
import { ref, watch } from 'vue'
import type { ToggleProps } from '@stina/extension-api'
import Toggle from '../inputs/Toggle.vue'

const props = defineProps<ToggleProps>()

const emit = defineEmits<{
  action: [actionName: string, checked: boolean]
}>()

const model = ref(props.checked ?? false)

watch(model, (newValue) => {
  emit('action', props.onChangeAction, newValue)
})
</script>

<template>
  <Toggle v-model="model" :label="label" :description="description" :disabled="disabled" />
</template>
