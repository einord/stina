<script lang="ts" setup>
import type { PanelProps } from '@stina/extension-api'
import FormHeader from '../common/FormHeader.vue'
import IconToggleButton from '../buttons/IconToggleButton.vue'
import ExtensionComponent from './ExtensionComponent.vue'

defineProps<PanelProps>()

const emit = defineEmits<{
  action: [actionName: string]
}>()
</script>

<template>
  <section class="extension-panel">
    <FormHeader :title="title" :description="description" :icon="icon">
      <IconToggleButton
        v-for="action in actions"
        :key="action.action"
        :icon="action.icon"
        :tooltip="action.tooltip"
        :type="action.type"
        @click="emit('action', action.action)"
      />
    </FormHeader>
    <div v-if="content" class="panel-content">
      <ExtensionComponent :extension-component="content" />
    </div>
  </section>
</template>
