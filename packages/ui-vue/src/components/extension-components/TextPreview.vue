<script lang="ts" setup>
import type { TextPreviewProps } from '@stina/extension-api'
import type { StyleValue } from 'vue'
import TextPreview from '../common/TextPreview.vue'
import { computed } from 'vue'

const props = defineProps<TextPreviewProps>()

const rootStyle = computed(() => props.style as StyleValue)
</script>

<template>
  <TextPreview
    class="extension-text-preview"
    :style="rootStyle"
    :content="props.content"
    :max-lines="props.maxLines"
    strict
  />
</template>
