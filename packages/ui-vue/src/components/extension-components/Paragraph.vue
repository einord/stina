<script lang="ts" setup>
import type { ParagraphProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'

const props = defineProps<ParagraphProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <p :style="rootStyle">{{ props.text }}</p>
</template>
