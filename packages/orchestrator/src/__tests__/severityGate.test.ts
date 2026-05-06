import { describe, it, expect, vi } from 'vitest'
import type { StreamEvent } from '@stina/extension-api'
import type { AutoPolicy, Thread } from '@stina/core'
import { createProviderProducer, type ChatStreamDispatcher } from '../producers/provider.js'
import type { DecisionTurnContext } from '../producers/canned.js'
import type { MemoryContext } from '../memory/MemoryContextLoader.js'
import type { TurnStreamEvent } from '../streamEvents.js'

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 'thread-1',
    trigger: { kind: 'user' },
    status: 'active',
    surfaced_at: null,
    notified_at: null,
    title: 'Test',
    summary: null,
    linked_entities: [],
    created_at: 0,
    last_activity_at: 0,
    ...overrides,
  }
}

function emptyMemory(): MemoryContext {
  return { active_instructions: [], linked_facts: [] }
}

function makeContext(overrides: Partial<DecisionTurnContext> = {}): DecisionTurnContext {
  return {
    thread: makeThread(),
    messages: [],
    memory: emptyMemory(),
    ...overrides,
  }
}

function makePolicy(overrides: Partial<AutoPolicy> = {}): AutoPolicy {
  return {
    id: 'policy-1',
    tool_id: 'high_tool',
    scope: {},
    mode: 'inform',
    created_at: 0,
    source_thread_id: null,
    approval_count: 1,
    created_by_suggestion: false,
    ...overrides,
  }
}

/**
 * Build an async generator that yields the supplied events in order.
 */
function streamOf(...events: StreamEvent[]): AsyncGenerator<StreamEvent, void, unknown> {
  return (async function* () {
    for (const event of events) {
      yield event
    }
  })()
}

/**
 * Standard two-iteration dispatcher: first emits a tool_start, second emits
 * a text reply. Caller supplies the tool name and severity.
 */
function makeTwoIterDispatcher(
  toolName: string,
  toolCallId = 'tc-1'
): ChatStreamDispatcher {
  let iter = 0
  return () => {
    iter++
    if (iter === 1) {
      return streamOf(
        { type: 'tool_start', name: toolName, input: { x: 1 }, toolCallId },
        { type: 'done' }
      )
    }
    return streamOf({ type: 'content', text: 'model reply' }, { type: 'done' })
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('severity gate — low/medium tools execute without policy', () => {
  it('low-severity tool: executeTool called, no audit callbacks fired', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn()
    const logAutoAction = vi.fn()
    const logActionBlocked = vi.fn()

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('low_tool'),
      tools: [
        {
          id: 'low_tool',
          name: 'low_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'low',
        },
      ],
      executeTool,
      lookupPolicy,
      logAutoAction,
      logActionBlocked,
    })

    await producer(makeContext())

    expect(executeTool).toHaveBeenCalledWith('low_tool', { x: 1 })
    expect(lookupPolicy).not.toHaveBeenCalled()
    expect(logAutoAction).not.toHaveBeenCalled()
    expect(logActionBlocked).not.toHaveBeenCalled()
  })

  it('medium-severity tool: executeTool called, no audit callbacks fired', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn()
    const logActionBlocked = vi.fn()

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('med_tool'),
      tools: [
        {
          id: 'med_tool',
          name: 'med_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'medium',
        },
      ],
      executeTool,
      lookupPolicy,
      logActionBlocked,
    })

    await producer(makeContext())

    expect(executeTool).toHaveBeenCalledWith('med_tool', { x: 1 })
    expect(lookupPolicy).not.toHaveBeenCalled()
    expect(logActionBlocked).not.toHaveBeenCalled()
  })
})

describe('severity gate — high tool + no lookupPolicy', () => {
  it('blocked when lookupPolicy is not provided; logActionBlocked called', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const logActionBlocked = vi.fn().mockResolvedValue(undefined)
    const events: TurnStreamEvent[] = []

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('high_tool'),
      tools: [
        {
          id: 'high_tool',
          name: 'high_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
        },
      ],
      executeTool,
      // lookupPolicy intentionally omitted
      logActionBlocked,
    })

    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))

    // Tool must NOT have been executed.
    expect(executeTool).not.toHaveBeenCalled()

    // logActionBlocked must have been called with the right shape.
    expect(logActionBlocked).toHaveBeenCalledOnce()
    const call = logActionBlocked.mock.calls[0]![0]
    expect(call.tool_id).toBe('high_tool')
    expect(call.severity).toBe('high')
    expect(call.reason).toBe('no_matching_policy')
    expect(call.chosen_alternative).toBe('skip')
    expect(call.thread_id).toBe('thread-1')

    // tool_blocked event must have been emitted.
    const blocked = events.find((e) => e.type === 'tool_blocked')
    expect(blocked).toBeDefined()
    if (blocked && blocked.type === 'tool_blocked') {
      expect(blocked.name).toBe('high_tool')
      expect(blocked.reason).toBe('no_matching_policy')
    }
  })
})

describe('severity gate — high tool + lookupPolicy returns null', () => {
  it('blocked; logActionBlocked called with no_matching_policy', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn().mockResolvedValue(null)
    const logActionBlocked = vi.fn().mockResolvedValue(undefined)

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('high_tool'),
      tools: [
        {
          id: 'high_tool',
          name: 'high_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
        },
      ],
      executeTool,
      lookupPolicy,
      logActionBlocked,
    })

    await producer(makeContext())

    expect(executeTool).not.toHaveBeenCalled()
    expect(logActionBlocked).toHaveBeenCalledOnce()
    expect(logActionBlocked.mock.calls[0]![0].reason).toBe('no_matching_policy')
  })
})

describe('severity gate — high tool + lookupPolicy returns a policy', () => {
  it('no redactor: logAutoAction receives sentinel strings and flagged_for_review=true', async () => {
    const policy = makePolicy()
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn().mockResolvedValue(policy)
    const logAutoAction = vi.fn().mockResolvedValue(undefined)
    const logActionBlocked = vi.fn()

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('high_tool'),
      tools: [
        {
          id: 'high_tool',
          name: 'high_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
          // no redactor declared — should hit the no-redactor branch
        },
      ],
      executeTool,
      lookupPolicy,
      logAutoAction,
      logActionBlocked,
    })

    await producer(makeContext())

    expect(executeTool).toHaveBeenCalledWith('high_tool', { x: 1 })
    expect(logActionBlocked).not.toHaveBeenCalled()
    expect(logAutoAction).toHaveBeenCalledOnce()

    const call = logAutoAction.mock.calls[0]![0]
    expect(call.tool_id).toBe('high_tool')
    expect(call.policy_id).toBe('policy-1')
    expect(call.tool_input).toBe('[redacted: no redactor declared]')
    expect(call.tool_output).toBe('[redacted: no redactor declared]')
    expect(call.flagged_for_review).toBe(true)
    expect(call.thread_id).toBe('thread-1')
    expect(call.severity).toBe('high')
    expect(typeof call.duration_ms).toBe('number')
  })

  it('with redactor: logAutoAction receives redacted output and flagged_for_review=false', async () => {
    const policy = makePolicy()
    const executeTool = vi.fn().mockResolvedValue({ success: true, data: 'some result' })
    const lookupPolicy = vi.fn().mockResolvedValue(policy)
    const logAutoAction = vi.fn().mockResolvedValue(undefined)
    const logActionBlocked = vi.fn()

    // Redactor that returns fixed sanitized shapes regardless of input
    const redactor = vi.fn().mockImplementation(() => ({
      tool_input: { redacted: true },
      tool_output: { redacted: true },
    }))

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('high_tool'),
      tools: [
        {
          id: 'high_tool',
          name: 'high_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
          redactor,
        },
      ],
      executeTool,
      lookupPolicy,
      logAutoAction,
      logActionBlocked,
    })

    await producer(makeContext())

    expect(executeTool).toHaveBeenCalledWith('high_tool', { x: 1 })
    expect(logActionBlocked).not.toHaveBeenCalled()
    expect(logAutoAction).toHaveBeenCalledOnce()
    expect(redactor).toHaveBeenCalledOnce()

    const call = logAutoAction.mock.calls[0]![0]
    expect(call.tool_id).toBe('high_tool')
    expect(call.policy_id).toBe('policy-1')
    // Redactor output — not the sentinel string
    expect(call.tool_input).toEqual({ redacted: true })
    expect(call.tool_output).toEqual({ redacted: true })
    expect(call.flagged_for_review).toBe(false)
    expect(call.thread_id).toBe('thread-1')
    expect(call.severity).toBe('high')
    expect(typeof call.duration_ms).toBe('number')
  })
})

describe('severity gate — critical tool', () => {
  it('always blocked even when lookupPolicy returns a policy', async () => {
    const policy = makePolicy({ tool_id: 'crit_tool' })
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn().mockResolvedValue(policy)
    const logActionBlocked = vi.fn().mockResolvedValue(undefined)
    const events: TurnStreamEvent[] = []

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('crit_tool'),
      tools: [
        {
          id: 'crit_tool',
          name: 'crit_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'critical',
        },
      ],
      executeTool,
      lookupPolicy,
      logActionBlocked,
    })

    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))

    expect(executeTool).not.toHaveBeenCalled()
    // lookupPolicy must NOT be called for critical tools
    expect(lookupPolicy).not.toHaveBeenCalled()

    expect(logActionBlocked).toHaveBeenCalledOnce()
    const call = logActionBlocked.mock.calls[0]![0]
    expect(call.reason).toBe('critical_severity')

    const blocked = events.find((e) => e.type === 'tool_blocked')
    expect(blocked).toBeDefined()
    if (blocked && blocked.type === 'tool_blocked') {
      expect(blocked.reason).toBe('critical_severity')
    }
  })
})

describe('severity gate — hallucinated tool', () => {
  it('blocked without policy lookup when tool name is not in advertised tools', async () => {
    const executeTool = vi.fn().mockResolvedValue({ success: true })
    const lookupPolicy = vi.fn()
    const logActionBlocked = vi.fn().mockResolvedValue(undefined)
    const events: TurnStreamEvent[] = []

    const producer = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('nonexistent_tool'),
      tools: [
        {
          id: 'real_tool',
          name: 'real_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'low',
        },
      ],
      executeTool,
      lookupPolicy,
      logActionBlocked,
    })

    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))

    expect(executeTool).not.toHaveBeenCalled()
    // lookupPolicy must NOT be called for hallucinated tools
    expect(lookupPolicy).not.toHaveBeenCalled()

    expect(logActionBlocked).toHaveBeenCalledOnce()
    expect(logActionBlocked.mock.calls[0]![0].reason).toBe('hallucinated_tool')

    const blocked = events.find((e) => e.type === 'tool_blocked')
    expect(blocked).toBeDefined()
    if (blocked && blocked.type === 'tool_blocked') {
      expect(blocked.reason).toBe('hallucinated_tool')
    }
  })
})

describe('severity gate — protocol correctness for blocked tools', () => {
  it('assistant message includes blocked call in tool_calls, plus a synthetic tool result', async () => {
    const capturedMessages: unknown[] = []
    let iter = 0

    const dispatcher: ChatStreamDispatcher = (messages) => {
      iter++
      if (iter > 1) {
        // capture the second-iteration messages for inspection
        capturedMessages.push(...messages)
      }
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'crit_tool', input: { a: 1 }, toolCallId: 'tc-block' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'ok' }, { type: 'done' })
    }

    const producer = createProviderProducer({
      dispatcher,
      tools: [
        {
          id: 'crit_tool',
          name: 'crit_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'critical',
        },
      ],
      executeTool: vi.fn().mockResolvedValue({ success: true }),
    })

    await producer(makeContext())

    // The second dispatch should see both assistant + tool messages.
    const assistantMsg = capturedMessages.find(
      (m: unknown) =>
        (m as { role?: string }).role === 'assistant' &&
        Array.isArray((m as { tool_calls?: unknown[] }).tool_calls)
    ) as { role: string; tool_calls: Array<{ id: string }> } | undefined
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.tool_calls.some((tc) => tc.id === 'tc-block')).toBe(true)

    const toolMsg = capturedMessages.find(
      (m: unknown) =>
        (m as { role?: string }).role === 'tool' &&
        (m as { tool_call_id?: string }).tool_call_id === 'tc-block'
    ) as { role: string; content: string; tool_call_id: string } | undefined
    expect(toolMsg).toBeDefined()
    const parsed = JSON.parse(toolMsg!.content) as { success: boolean; error: string }
    expect(parsed.success).toBe(false)
    expect(parsed.error).toMatch(/critical severity/)
  })
})

describe('severity gate — provider-emitted tool_end for blocked tool is suppressed', () => {
  it('tool_end for a blocked tool_call_id is not re-emitted', async () => {
    const events: TurnStreamEvent[] = []
    let iter = 0

    // Dispatcher that emits tool_start + tool_end (provider-run) for a high tool.
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'crit_tool', input: {}, toolCallId: 'tc-1' },
          // Simulate provider emitting tool_end itself (internal execution)
          { type: 'tool_end', name: 'crit_tool', output: { ok: true }, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'done' }, { type: 'done' })
    }

    const producer = createProviderProducer({
      dispatcher,
      tools: [
        {
          id: 'crit_tool',
          name: 'crit_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'critical',
        },
      ],
      executeTool: vi.fn(),
    })

    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))

    // tool_end for tc-1 must NOT appear in the stream (it was blocked)
    const toolEndEvents = events.filter((e) => e.type === 'tool_end')
    expect(toolEndEvents.length).toBe(0)
  })
})

describe('severity gate — loop continues after blocked tool', () => {
  it('model gets the blocked error result and produces a second reply', async () => {
    const events: TurnStreamEvent[] = []
    let iter = 0

    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'crit_tool', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'sorry, blocked' }, { type: 'done' })
    }

    const producer = createProviderProducer({
      dispatcher,
      tools: [
        {
          id: 'crit_tool',
          name: 'crit_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'critical',
        },
      ],
      executeTool: vi.fn(),
    })

    const out = await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))

    // The loop ran at least 2 iterations.
    expect(iter).toBe(2)
    // The final reply text comes from the second iteration.
    expect(out.content.text).toBe('sorry, blocked')
  })
})

describe('severity gate — thread_id passed to callbacks', () => {
  it('logAutoAction and logActionBlocked receive thread_id from context.thread.id', async () => {
    const logActionBlocked = vi.fn().mockResolvedValue(undefined)
    const logAutoAction = vi.fn().mockResolvedValue(undefined)

    const thread = makeThread({ id: 'my-thread-42' })

    // Test logActionBlocked path (critical tool)
    const producer1 = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('crit_tool'),
      tools: [
        {
          id: 'crit_tool',
          name: 'crit_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'critical',
        },
      ],
      executeTool: vi.fn(),
      logActionBlocked,
    })

    await producer1(makeContext({ thread }))
    expect(logActionBlocked.mock.calls[0]![0].thread_id).toBe('my-thread-42')

    // Test logAutoAction path (high tool with policy)
    const policy = makePolicy({ tool_id: 'high_tool' })
    const producer2 = createProviderProducer({
      dispatcher: makeTwoIterDispatcher('high_tool'),
      tools: [
        {
          id: 'high_tool',
          name: 'high_tool',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
        },
      ],
      executeTool: vi.fn().mockResolvedValue({ success: true }),
      lookupPolicy: vi.fn().mockResolvedValue(policy),
      logAutoAction,
    })

    await producer2(makeContext({ thread }))
    expect(logAutoAction.mock.calls[0]![0].thread_id).toBe('my-thread-42')
  })
})
