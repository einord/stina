<script setup lang="ts">
import { ref } from 'vue'
import { useApi } from '../composables/useApi.js'
import GreetingCard from './GreetingCard.vue'
import type { Greeting } from '@stina/shared'

const api = useApi()

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
    error.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="home-page">
    <section class="greeting-section">
      <h2>Say Hello</h2>
      <form class="greeting-form" @submit.prevent="handleGreet">
        <input v-model="name" type="text" placeholder="Enter your name" class="greeting-input" />
        <button type="submit" class="greeting-button" :disabled="loading">
          {{ loading ? 'Loading...' : 'Greet' }}
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
      color: var(--color-foreground, #1a1a2e);
    }

    > .greeting-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;

      > .greeting-input {
        flex: 1;
        padding: 0.75rem 1rem;
        border: 1px solid var(--color-border, #e5e7eb);
        border-radius: var(--radius, 0.5rem);
        background: var(--color-background, #ffffff);
        color: var(--color-foreground, #1a1a2e);
        font-size: 1rem;

        &:focus {
          outline: none;
          border-color: var(--color-primary, #6366f1);
        }
      }

      > .greeting-button {
        padding: 0.75rem 1.5rem;
        border: none;
        border-radius: var(--radius, 0.5rem);
        background: var(--color-primary, #6366f1);
        color: var(--color-primary-text, #ffffff);
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
      background: var(--color-danger, #ef4444);
      color: white;
      border-radius: var(--radius, 0.5rem);
    }

    > .greeting-result {
      margin-top: 1rem;
    }
  }
}
</style>
