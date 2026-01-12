<script lang="ts" setup>
import type { HeaderProps } from '@stina/extension-api'
import FormHeader from '../common/FormHeader.vue'

defineProps<HeaderProps>()
</script>

<template>
  <form-header class="extension-header" :title="title" :description="description" :icon="icon" />
</template>
