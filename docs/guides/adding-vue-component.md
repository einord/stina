# Adding Shared Vue Components

This guide explains how to create shared Vue components in `ui-vue` and use them across Web and Electron applications.

## 1. Create the Component

Create your component in `packages/ui-vue/src/components/`. Organize by category (e.g., `common/`, `inputs/`, `buttons/`).

```vue
<!-- packages/ui-vue/src/components/common/StatusCard.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApi } from '../../composables/useApi.js'

const props = defineProps<{
  title: string
}>()

const api = useApi()
const status = ref<{ ok: boolean } | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    status.value = await api.health()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="status-card">
    <h3>{{ title }}</h3>
    <span v-if="loading">Loading...</span>
    <span v-else-if="status?.ok" class="ok">Connected</span>
    <span v-else class="error">Disconnected</span>
  </div>
</template>

<style scoped>
.status-card {
  padding: 1rem;
  border: 1px solid var(--theme-general-border-color);
  border-radius: 0.5rem;
}
.ok { color: var(--success); }
.error { color: var(--danger); }
</style>
```

## 2. Use `useApi()` for Backend Communication

The `useApi()` composable provides a platform-agnostic API client:

- **Web**: Uses HTTP requests to the backend
- **Electron**: Uses IPC to the main process

```ts
import { useApi } from '@stina/ui-vue'

const api = useApi()

// Examples
const themes = await api.getThemes()
const extensions = await api.getExtensions()
const conversations = await api.chat.listConversations()
```

## 3. Export from Package Index

Add your component export to `packages/ui-vue/src/index.ts`:

```ts
// Components
export { default as AppShell } from './components/AppShell.vue'
export { default as StatusCard } from './components/common/StatusCard.vue'
// ... other exports
```

## 4. Use in Web and Electron Renderer

Import and use the component in either application:

```vue
<!-- apps/web/src/views/Dashboard.vue or apps/electron/src/renderer/views/Dashboard.vue -->
<script setup lang="ts">
import { StatusCard } from '@stina/ui-vue'
</script>

<template>
  <StatusCard title="API Status" />
</template>
```

## Tips

- Use CSS variables (`--theme-*`) for theming consistency
- Keep components focused and reusable
- Use TypeScript for props and emits
- Follow existing patterns in `packages/ui-vue/src/components/`
