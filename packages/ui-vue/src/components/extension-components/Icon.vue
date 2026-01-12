<script lang="ts" setup>
import type { IconProps } from '@stina/extension-api'
import Icon from '../common/Icon.vue'

defineProps<IconProps>()
</script>

<template>
  <Icon :name="name" :title="title" />
</template>
