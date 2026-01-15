<script lang="ts" setup>
import type { IconProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import IconComponent from '../common/Icon.vue'
import { computed } from 'vue'

const props = defineProps<IconProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <IconComponent :style="rootStyle" :name="props.name" :title="props.title" />
</template>
