import type { Greeting } from '@stina/shared'

/**
 * Get a greeting message
 * @param name - Name to greet, defaults to "world"
 */
export function getGreeting(name = 'world'): Greeting {
  return {
    message: `Hello, ${name}!`,
    timestamp: new Date().toISOString(),
  }
}
