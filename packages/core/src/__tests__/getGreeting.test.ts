import { describe, it, expect } from 'vitest'
import { getGreeting } from '../hello/getGreeting.js'

describe('getGreeting', () => {
  it('should return greeting with default name', () => {
    const result = getGreeting()

    expect(result.message).toBe('Hello, world!')
    expect(result.timestamp).toBeDefined()
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
  })

  it('should return greeting with custom name', () => {
    const result = getGreeting('Stina')

    expect(result.message).toBe('Hello, Stina!')
    expect(result.timestamp).toBeDefined()
  })

  it('should handle empty string as name', () => {
    const result = getGreeting('')

    expect(result.message).toBe('Hello, !')
  })
})
