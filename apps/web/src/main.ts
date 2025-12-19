import { createApp } from 'vue'
import App from './App.vue'
import { initTheme } from './theme.js'
import { apiClientKey } from '@stina/ui-vue'
import { createHttpApiClient } from './api/client.js'
import '@stina/ui-vue/styles/reset.css'

const app = createApp(App)

// Provide the HTTP-based API client
app.provide(apiClientKey, createHttpApiClient())

// Initialize theme
initTheme()

app.mount('#app')
