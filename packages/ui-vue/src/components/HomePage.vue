<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useI18n } from '../composables/useI18n.js'
import GreetingCard from './GreetingCard.vue'
import type { Greeting } from '@stina/shared'

const api = useApi()
const { t } = useI18n()

const name = ref('')
const greeting = ref<Greeting | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

async function handleGreet() {
  loading.value = true
  error.value = null

  try {
    greeting.value = await api.getGreeting(name.value || undefined)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('home.error_generic')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="home-page">
    <section class="greeting-section">
      <h2>{{ t('home.title') }}</h2>
      <form class="greeting-form" @submit.prevent="handleGreet">
        <input
          v-model="name"
          type="text"
          :placeholder="t('home.name_placeholder')"
          class="greeting-input"
        />
        <button type="submit" class="greeting-button" :disabled="loading">
          {{ loading ? t('home.loading') : t('home.greet_button') }}
        </button>
      </form>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>

      <GreetingCard v-if="greeting" :greeting="greeting" class="greeting-result" />
    </section>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 600px;
  margin: 0 auto;

  > .greeting-section {
    > h2 {
      margin-bottom: 1rem;
      color: var(--theme-main-window-foreground, #eaeaea);
    }

    > .greeting-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;

      > .greeting-input {
        flex: 1;
        padding: 0.75rem 1rem;
        border: 1px solid var(--theme-surface-border, #3d3d5c);
        border-radius: var(--theme-layout-radius, 0.5rem);
        background: var(--theme-main-window-background, #1a1a2e);
        color: var(--theme-main-window-foreground, #eaeaea);
        font-size: 1rem;

        &:focus {
          outline: none;
          border-color: var(--theme-accent-primary, #6366f1);
        }
      }

      > .greeting-button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: var(--theme-layout-radius, 0.5rem);
        background: var(--theme-accent-primary, #6366f1);
        color: var(--theme-accent-primary-text, #ffffff);
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;

        &:hover:not(:disabled) {
          opacity: 0.9;
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }

    > .error-message {
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
      background: var(--theme-state-danger, #ef4444);
      color: white;
      border-radius: var(--theme-layout-radius, 0.5rem);
    }

    > .greeting-result {
      margin-top: 1rem;
    }
  }
}
</style>
