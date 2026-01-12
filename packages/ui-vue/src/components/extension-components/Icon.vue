<script lang="ts" setup>
import type { IconProps } from '@stina/extension-api'
import IconComponent from '../common/Icon.vue'

const props = defineProps<IconProps>()
</script>

<template>
  <IconComponent :name="props.name" :title="props.title" />
</template>
