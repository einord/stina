import type { AIProvider } from '../types/provider.js'

/**
 * Registry for AI providers
 * Providers register themselves here to be used by the chat system
 */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>()

  /**
   * Register a provider
   * @throws Error if provider with same ID already exists
   */
  register(provider: AIProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider ${provider.id} is already registered`)
    }
    this.providers.set(provider.id, provider)
  }

  /**
   * Get a provider by ID
   */
  get(id: string): AIProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * List all registered providers
   */
  list(): AIProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Unregister a provider
   */
  unregister(id: string): boolean {
    return this.providers.delete(id)
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear()
  }

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id)
  }
}

/**
 * Module-level singleton instance.
 * Note: This pattern makes testing harder since state persists across tests.
 * Use resetForTesting() in test setup to get a fresh instance.
 */
export let providerRegistry = new ProviderRegistry()

/** Reset singleton for testing purposes. */
export function resetProviderRegistryForTesting(): void {
  providerRegistry = new ProviderRegistry()
}
