/**
 * Unit tests for NotificationDispatcher.
 *
 * Covers:
 *   - subscribe/dispatch basic round-trip
 *   - unsubscribe stops receiving events
 *   - faulty listener is swallowed (does not prevent other listeners)
 *   - multiple listeners all receive the event
 */

import { describe, it, expect, vi } from 'vitest'
import { NotificationDispatcher } from '../notificationDispatcher.js'
import type { NotificationEvent } from '../notificationDispatcher.js'

function makeEvent(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    thread_id: 'thread-1',
    user_id: 'user-1',
    title: 'Test notification',
    preview: 'A preview snippet',
    kind: 'normal',
    notified_at: Date.now(),
    ...overrides,
  }
}

describe('NotificationDispatcher', () => {
  it('dispatches an event to a subscribed listener', () => {
    const dispatcher = new NotificationDispatcher()
    const listener = vi.fn()
    dispatcher.subscribe(listener)

    const event = makeEvent()
    dispatcher.dispatch(event)

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(event)
  })

  it('unsubscribe stops the listener from receiving further events', () => {
    const dispatcher = new NotificationDispatcher()
    const listener = vi.fn()
    const unsubscribe = dispatcher.subscribe(listener)

    dispatcher.dispatch(makeEvent({ thread_id: 'before' }))
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()

    dispatcher.dispatch(makeEvent({ thread_id: 'after' }))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('swallows a throwing listener and still calls subsequent listeners', () => {
    const dispatcher = new NotificationDispatcher()
    const badListener = vi.fn().mockImplementation(() => {
      throw new Error('listener exploded')
    })
    const goodListener = vi.fn()

    dispatcher.subscribe(badListener)
    dispatcher.subscribe(goodListener)

    const event = makeEvent()
    expect(() => dispatcher.dispatch(event)).not.toThrow()

    expect(badListener).toHaveBeenCalledOnce()
    expect(goodListener).toHaveBeenCalledOnce()
    expect(goodListener).toHaveBeenCalledWith(event)
  })

  it('delivers to multiple listeners independently', () => {
    const dispatcher = new NotificationDispatcher()
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    const listenerC = vi.fn()

    dispatcher.subscribe(listenerA)
    dispatcher.subscribe(listenerB)
    dispatcher.subscribe(listenerC)

    const event = makeEvent({ kind: 'failure' })
    dispatcher.dispatch(event)

    expect(listenerA).toHaveBeenCalledWith(event)
    expect(listenerB).toHaveBeenCalledWith(event)
    expect(listenerC).toHaveBeenCalledWith(event)
  })
})
