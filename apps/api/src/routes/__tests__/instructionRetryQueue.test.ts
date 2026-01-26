import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { InstructionRetryQueue } from '../instructionRetryQueue'
import type { ChatEvent } from '../chatStream'

describe('InstructionRetryQueue', () => {
  let queue: InstructionRetryQueue
  let deliveredEvents: ChatEvent[]
  let deliveryFn: (event: ChatEvent) => boolean

  const createEvent = (userId: string, conversationId?: string): ChatEvent => ({
    type: 'instruction-received',
    userId,
    conversationId,
  })

  beforeEach(() => {
    vi.useFakeTimers()
    deliveredEvents = []
    deliveryFn = (event) => {
      deliveredEvents.push(event)
      return true
    }
    queue = new InstructionRetryQueue({
      initialDelay: 500,
      maxDelay: 60_000,
      maxAttempts: 10,
      maxAge: 5 * 60 * 1000,
    })
    queue.setDeliveryFunction(deliveryFn)
  })

  afterEach(() => {
    queue.clear()
    vi.useRealTimers()
  })

  describe('enqueue', () => {
    it('should queue an event and schedule retry', () => {
      const event = createEvent('user-1')
      queue.enqueue(event)

      expect(queue.getPendingCount('user-1')).toBe(1)
      expect(deliveredEvents).toHaveLength(0)
    })

    it('should deliver event after initial delay', () => {
      const event = createEvent('user-1')
      queue.enqueue(event)

      vi.advanceTimersByTime(500)

      expect(deliveredEvents).toHaveLength(1)
      expect(deliveredEvents[0]).toBe(event)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })

    it('should handle multiple events for same user', () => {
      const event1 = createEvent('user-1', 'conv-1')
      const event2 = createEvent('user-1', 'conv-2')

      queue.enqueue(event1)
      queue.enqueue(event2)

      expect(queue.getPendingCount('user-1')).toBe(2)

      vi.advanceTimersByTime(500)

      expect(deliveredEvents).toHaveLength(2)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })

    it('should handle events for different users independently', () => {
      const event1 = createEvent('user-1')
      const event2 = createEvent('user-2')

      queue.enqueue(event1)
      queue.enqueue(event2)

      expect(queue.getPendingCount('user-1')).toBe(1)
      expect(queue.getPendingCount('user-2')).toBe(1)

      vi.advanceTimersByTime(500)

      expect(deliveredEvents).toHaveLength(2)
      expect(queue.getPendingCount('user-1')).toBe(0)
      expect(queue.getPendingCount('user-2')).toBe(0)
    })
  })

  describe('retry with failure', () => {
    it('should retry with exponential backoff on delivery failure', () => {
      let failCount = 2
      queue.setDeliveryFunction((event) => {
        if (failCount > 0) {
          failCount--
          return false
        }
        deliveredEvents.push(event)
        return true
      })

      const event = createEvent('user-1')
      queue.enqueue(event)

      // First attempt after 500ms - fails
      vi.advanceTimersByTime(500)
      expect(deliveredEvents).toHaveLength(0)
      expect(queue.getPendingCount('user-1')).toBe(1)

      // Second attempt after 1000ms - fails
      vi.advanceTimersByTime(1000)
      expect(deliveredEvents).toHaveLength(0)
      expect(queue.getPendingCount('user-1')).toBe(1)

      // Third attempt after 2000ms - succeeds
      vi.advanceTimersByTime(2000)
      expect(deliveredEvents).toHaveLength(1)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })

    it('should cap delay at maxDelay', () => {
      const attemptTimes: number[] = []
      queue.setDeliveryFunction(() => {
        attemptTimes.push(Date.now())
        return false // Always fail
      })

      const event = createEvent('user-1')
      queue.enqueue(event)

      // Run through several retry cycles
      // 500ms, 1s, 2s, 4s, 8s, 16s, 32s, 60s (capped)
      vi.advanceTimersByTime(500 + 1000 + 2000 + 4000 + 8000 + 16000 + 32000 + 60000)

      // Verify delay doesn't exceed maxDelay
      for (let i = 1; i < attemptTimes.length; i++) {
        const prevTime = attemptTimes[i - 1]
        const currTime = attemptTimes[i]
        if (prevTime !== undefined && currTime !== undefined) {
          const delay = currTime - prevTime
          expect(delay).toBeLessThanOrEqual(60000)
        }
      }
    })

    it('should discard message after max attempts', () => {
      queue = new InstructionRetryQueue({
        initialDelay: 100,
        maxDelay: 100,
        maxAttempts: 3,
        maxAge: 5 * 60 * 1000,
      })
      queue.setDeliveryFunction(() => false) // Always fail

      const event = createEvent('user-1')
      queue.enqueue(event)

      // enqueue sets attempts = 1 (first attempt already failed)
      // After 100ms: attempt 2, still pending
      vi.advanceTimersByTime(100)
      expect(queue.getPendingCount('user-1')).toBe(1)

      // After another 100ms: attempt 3, still pending (checked before delivery)
      vi.advanceTimersByTime(100)
      expect(queue.getPendingCount('user-1')).toBe(1)

      // After another 100ms: attempts >= maxAttempts, message discarded
      vi.advanceTimersByTime(100)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })

    it('should discard message after max age', () => {
      queue = new InstructionRetryQueue({
        initialDelay: 1000,
        maxDelay: 60_000,
        maxAttempts: 100,
        maxAge: 2000, // 2 seconds max age
      })
      queue.setDeliveryFunction(() => false) // Always fail

      const event = createEvent('user-1')
      queue.enqueue(event)

      // First retry at 1000ms - still within max age
      vi.advanceTimersByTime(1000)
      expect(queue.getPendingCount('user-1')).toBe(1)

      // Second retry at 2000ms - message is now too old (2000ms > maxAge)
      vi.advanceTimersByTime(2000)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })
  })

  describe('onListenerConnected', () => {
    it('should deliver queued messages immediately when listener connects', () => {
      queue.setDeliveryFunction(() => false) // Fail initial delivery

      const event = createEvent('user-1')
      queue.enqueue(event)

      // No delivery yet (initial timer hasn't fired)
      expect(deliveredEvents).toHaveLength(0)

      // Listener connects - set up successful delivery
      queue.setDeliveryFunction(deliveryFn)
      queue.onListenerConnected('user-1')

      // Message should be delivered immediately (no timer advance needed)
      expect(deliveredEvents).toHaveLength(1)
      expect(deliveredEvents[0]).toBe(event)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })

    it('should not affect queues for other users', () => {
      queue.setDeliveryFunction(() => false) // Fail delivery

      queue.enqueue(createEvent('user-1'))
      queue.enqueue(createEvent('user-2'))

      // Set up delivery that only works for user-1
      queue.setDeliveryFunction((event) => {
        if (event.userId === 'user-1') {
          deliveredEvents.push(event)
          return true
        }
        return false
      })

      queue.onListenerConnected('user-1')

      // Only user-1's message should be delivered
      expect(deliveredEvents).toHaveLength(1)
      expect(deliveredEvents[0]?.userId).toBe('user-1')
      expect(queue.getPendingCount('user-1')).toBe(0)
      expect(queue.getPendingCount('user-2')).toBe(1)
    })

    it('should handle no queued messages gracefully', () => {
      queue.onListenerConnected('user-1')
      expect(deliveredEvents).toHaveLength(0)
    })

    it('should clear scheduled timer when listener connects', () => {
      queue.setDeliveryFunction(() => false) // Fail initial delivery

      const event = createEvent('user-1')
      queue.enqueue(event)

      // Set up successful delivery
      queue.setDeliveryFunction(deliveryFn)
      queue.onListenerConnected('user-1')

      expect(deliveredEvents).toHaveLength(1)

      // Advance past original timer - should not cause duplicate delivery
      vi.advanceTimersByTime(1000)
      expect(deliveredEvents).toHaveLength(1) // Still just 1
    })
  })

  describe('getPendingCount', () => {
    it('should return 0 for unknown user', () => {
      expect(queue.getPendingCount('unknown-user')).toBe(0)
    })

    it('should track count correctly through enqueue and delivery', () => {
      queue.enqueue(createEvent('user-1'))
      expect(queue.getPendingCount('user-1')).toBe(1)

      queue.enqueue(createEvent('user-1'))
      expect(queue.getPendingCount('user-1')).toBe(2)

      vi.advanceTimersByTime(500)
      expect(queue.getPendingCount('user-1')).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear all queues and timers', () => {
      queue.enqueue(createEvent('user-1'))
      queue.enqueue(createEvent('user-2'))

      queue.clear()

      expect(queue.getPendingCount('user-1')).toBe(0)
      expect(queue.getPendingCount('user-2')).toBe(0)

      // Timers should be cleared - no delivery after advance
      vi.advanceTimersByTime(10000)
      expect(deliveredEvents).toHaveLength(0)
    })
  })

  describe('no delivery function', () => {
    it('should not crash when no delivery function is set', () => {
      const emptyQueue = new InstructionRetryQueue()
      emptyQueue.enqueue(createEvent('user-1'))

      vi.advanceTimersByTime(1000)
      // Should not throw
      expect(emptyQueue.getPendingCount('user-1')).toBe(1)
    })
  })
})
