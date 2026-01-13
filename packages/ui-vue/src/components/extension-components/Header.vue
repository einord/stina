<script lang="ts" setup>
import type { HeaderProps } from '@stina/extension-api'
import FormHeader from '../common/FormHeader.vue'

const props = defineProps<HeaderProps>()
</script>

<template>
  <FormHeader class="extension-header" :title="props.title" :description="props.description" :icon="props.icon" />
</template>
