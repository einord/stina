<script lang="ts" setup>
import type { LabelProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'

const props = defineProps<LabelProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <span class="extension-label" :style="rootStyle">{{ props.text }}</span>
</template>
