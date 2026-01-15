<script lang="ts" setup>
import type { HeaderProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import FormHeader from '../common/FormHeader.vue'
import { computed } from 'vue'

const props = defineProps<HeaderProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <FormHeader
    class="extension-header"
    :style="rootStyle"
    :title="props.title"
    :description="props.description"
    :icon="props.icon"
  />
</template>
