<script lang="ts" setup>
import type { DividerProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import { computed } from 'vue'

const props = defineProps<DividerProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <hr :style="rootStyle" />
</template>
