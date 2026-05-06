/**
 * EventsHandler Tests
 *
 * Tests for the events.emitEvent handler — trust-boundary invariants per §04.
 */

import { describe, it, expect, vi } from 'vitest'
import { EventsHandler, type EmitThreadEventInput, type EmitThreadEventCallback } from './ExtensionHost.handlers.events.js'
import { PermissionChecker } from './PermissionChecker.js'
import type { HandlerContext } from './ExtensionHost.handlers.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(opts: { hasEventsEmit: boolean; extensionId?: string }): HandlerContext {
  const checker = new PermissionChecker(opts.hasEventsEmit ? ['events.emit'] : [])
  return {
    extensionId: opts.extensionId ?? 'test-ext',
    extension: {
      id: opts.extensionId ?? 'test-ext',
      manifest: {} as never,
      status: 'active',
      permissionChecker: checker,
      settings: {},
      registeredProviders: new Map(),
      registeredTools: new Map(),
      registeredActions: new Map(),
    },
    options: {},
  }
}

function validMailPayload(overrides?: Record<string, unknown>) {
  return {
    trigger: { kind: 'mail', extension_id: 'whatever', mail_id: 'mail-001' },
    content: { kind: 'mail', from: 'a@b.com', subject: 'Hi', snippet: 'Body', mail_id: 'mail-001' },
    source: { extension_id: 'whatever' },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EventsHandler — events.emitEvent', () => {
  it('happy path: invokes callback with stamped extension_id and returns thread_id', async () => {
    const callback: EmitThreadEventCallback = vi.fn().mockResolvedValue({ thread_id: 'thread-abc' })
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true, extensionId: 'my-extension' })

    const result = await handler.handle(ctx, 'events.emitEvent', {
      trigger: { kind: 'mail', extension_id: 'wrong-id', mail_id: 'mail-001' },
      content: { kind: 'mail', from: 'a@b.com', subject: 'Hi', snippet: 'Body', mail_id: 'mail-001' },
      source: { extension_id: 'wrong-id', component: 'sidebar' },
    })

    expect(result).toEqual({ thread_id: 'thread-abc' })
    expect(callback).toHaveBeenCalledOnce()

    const input = (callback as ReturnType<typeof vi.fn>).mock.calls[0]![0] as EmitThreadEventInput
    // Trust invariant: extension_id stamped from ctx.extensionId, not from worker payload.
    expect(input.source.extension_id).toBe('my-extension')
    expect(input.trigger).toMatchObject({ kind: 'mail', extension_id: 'my-extension', mail_id: 'mail-001' })
    // Optional component preserved.
    expect(input.source.component).toBe('sidebar')
  })

  it('stamps source.extension_id even when worker supplies a different value', async () => {
    const callback: EmitThreadEventCallback = vi.fn().mockResolvedValue({ thread_id: 'tid' })
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true, extensionId: 'real-ext' })

    await handler.handle(ctx, 'events.emitEvent', validMailPayload())

    const input = (callback as ReturnType<typeof vi.fn>).mock.calls[0]![0] as EmitThreadEventInput
    expect(input.source.extension_id).toBe('real-ext') // stamped
    if (input.trigger.kind === 'mail') {
      expect(input.trigger.extension_id).toBe('real-ext') // stamped
    }
  })

  it('rejects trigger.kind === "user" — extensions cannot impersonate user-origin events', async () => {
    const callback: EmitThreadEventCallback = vi.fn()
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true })

    await expect(
      handler.handle(ctx, 'events.emitEvent', {
        trigger: { kind: 'user' },
        content: { kind: 'mail', from: 'a@b.com', subject: 'Hi', snippet: 'Body', mail_id: 'm1' },
        source: { extension_id: 'ext' },
      })
    ).rejects.toThrow(/trigger\.kind 'user'/)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects trigger.kind === "stina" — extensions cannot impersonate stina-origin events', async () => {
    const callback: EmitThreadEventCallback = vi.fn()
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true })

    await expect(
      handler.handle(ctx, 'events.emitEvent', {
        trigger: { kind: 'stina', reason: 'dream_pass_insight' },
        content: { kind: 'mail', from: 'a@b.com', subject: 'Hi', snippet: 'Body', mail_id: 'm1' },
        source: { extension_id: 'ext' },
      })
    ).rejects.toThrow(/trigger\.kind 'stina'/)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects mismatched trigger.kind and content.kind (mail trigger + calendar content)', async () => {
    const callback: EmitThreadEventCallback = vi.fn()
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true })

    await expect(
      handler.handle(ctx, 'events.emitEvent', {
        trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'm1' },
        content: { kind: 'calendar', title: 'Meeting', starts_at: 0, ends_at: 1, event_id: 'ev1' },
        source: { extension_id: 'ext' },
      })
    ).rejects.toThrow(/trigger\.kind 'mail' and content\.kind 'calendar' must match/)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects when events.emit permission is missing', async () => {
    const callback: EmitThreadEventCallback = vi.fn()
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: false })

    await expect(
      handler.handle(ctx, 'events.emitEvent', validMailPayload())
    ).rejects.toThrow(/Event emission not allowed/)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects system content (host-only)', async () => {
    const callback: EmitThreadEventCallback = vi.fn()
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true })

    await expect(
      handler.handle(ctx, 'events.emitEvent', {
        trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'm1' },
        content: { kind: 'system', message: 'hack' },
        source: { extension_id: 'ext' },
      })
    ).rejects.toThrow(/system/)
    expect(callback).not.toHaveBeenCalled()
  })

  it('calendar happy path: stamps trigger.extension_id correctly', async () => {
    const callback: EmitThreadEventCallback = vi.fn().mockResolvedValue({ thread_id: 'cal-thread' })
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true, extensionId: 'calendar-ext' })

    const result = await handler.handle(ctx, 'events.emitEvent', {
      trigger: { kind: 'calendar', extension_id: 'wrong', event_id: 'ev-001' },
      content: { kind: 'calendar', title: 'Standup', starts_at: 1000, ends_at: 2000, event_id: 'ev-001' },
      source: { extension_id: 'wrong' },
    })

    expect(result).toEqual({ thread_id: 'cal-thread' })
    const input = (callback as ReturnType<typeof vi.fn>).mock.calls[0]![0] as EmitThreadEventInput
    if (input.trigger.kind === 'calendar') {
      expect(input.trigger.extension_id).toBe('calendar-ext')
    }
  })

  it('scheduled trigger has no extension_id (no stamping needed)', async () => {
    const callback: EmitThreadEventCallback = vi.fn().mockResolvedValue({ thread_id: 'sched-thread' })
    const handler = new EventsHandler(() => {}, callback)
    const ctx = makeCtx({ hasEventsEmit: true, extensionId: 'sched-ext' })

    const result = await handler.handle(ctx, 'events.emitEvent', {
      trigger: { kind: 'scheduled', job_id: 'job-001' },
      content: { kind: 'scheduled', job_id: 'job-001', description: 'Daily backup' },
      source: { extension_id: 'sched-ext' },
    })

    expect(result).toEqual({ thread_id: 'sched-thread' })
    const input = (callback as ReturnType<typeof vi.fn>).mock.calls[0]![0] as EmitThreadEventInput
    expect(input.trigger.kind).toBe('scheduled')
    expect(input.source.extension_id).toBe('sched-ext')
  })
})
