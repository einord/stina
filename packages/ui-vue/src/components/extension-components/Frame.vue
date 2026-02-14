<script lang="ts" setup>
import type { ExtensionComponentChildren, ExtensionComponentStyle, FrameVariant } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'
import FramePanel from '../panels/FramePanel.vue'
import ExtensionChildren from './ExtensionChildren.vue'

const props = defineProps<{
  title?: string | ExtensionComponentChildren
  collapsible?: boolean
  defaultExpanded?: boolean
  variant?: FrameVariant
  children?: ExtensionComponentChildren
  style?: ExtensionComponentStyle
}>()

const rootStyle = computed(() => props.style as StyleValue)

const hasTitle = computed(() => props.title !== undefined && props.title !== '')
const isTitleString = computed(() => typeof props.title === 'string')
</script>

<template>
  <frame-panel
    :variant="variant ?? 'border'"
    :style="rootStyle"
    :collapsible="collapsible"
    :default-expanded="defaultExpanded"
  >
    <template v-if="hasTitle" #title>
      <template v-if="isTitleString">{{ title }}</template>
      <extension-children v-else :children="(title as ExtensionComponentChildren)" />
    </template>
    <extension-children v-if="children" :children="children" />
  </frame-panel>
</template>
