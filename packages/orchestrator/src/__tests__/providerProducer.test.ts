import { describe, it, expect } from 'vitest'
import type {
  ChatMessage,
  ChatOptions,
  StreamEvent,
} from '@stina/extension-api'
import type { Message, Thread } from '@stina/core'
import {
  assembleSystemPrompt,
  createProviderProducer,
  mapTimelineToChatMessages,
  type ChatStreamDispatcher,
} from '../producers/provider.js'
import type { DecisionTurnContext } from '../producers/canned.js'
import type { MemoryContext } from '../memory/MemoryContextLoader.js'
import type { TurnStreamEvent } from '../streamEvents.js'

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't1',
    trigger: { kind: 'user' },
    status: 'active',
    first_turn_completed_at: null,
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

describe('assembleSystemPrompt', () => {
  it('returns the base prompt unchanged when memory is empty', () => {
    const prompt = assembleSystemPrompt(makeContext(), 'BASE')
    expect(prompt).toBe('BASE')
  })

  it('includes the active-instructions section when present', () => {
    const ctx = makeContext({
      memory: {
        active_instructions: [
          {
            id: '1',
            rule: 'svara kortfattat',
            scope: {},
            valid_from: 0,
            valid_until: null,
            invalidate_on: [],
            source_thread_id: null,
            created_at: 0,
            created_by: 'user',
          },
        ],
        linked_facts: [],
      },
    })
    const prompt = assembleSystemPrompt(ctx, 'BASE')
    expect(prompt).toContain('## Aktiva stående instruktioner')
    expect(prompt).toContain('- svara kortfattat')
  })

  it('includes the linked-facts section when present', () => {
    const ctx = makeContext({
      memory: {
        active_instructions: [],
        linked_facts: [
          {
            id: 'f1',
            fact: 'Peter is the manager',
            subject: 'peter@x',
            predicate: 'role',
            source_thread_id: null,
            last_referenced_at: 0,
            created_at: 0,
            created_by: 'user',
          },
        ],
      },
    })
    const prompt = assembleSystemPrompt(ctx, 'BASE')
    expect(prompt).toContain('## Faktaminnen om relaterade entiteter')
    expect(prompt).toContain('- peter@x (role): Peter is the manager')
  })

  it('uses the default base prompt when none supplied', () => {
    const prompt = assembleSystemPrompt(makeContext())
    expect(prompt).toMatch(/Stina/)
    expect(prompt).toMatch(/OPÅLITLIG EXTERN DATA/)
  })
})

describe('mapTimelineToChatMessages', () => {
  it('maps user messages to role=user', () => {
    const messages: Message[] = [
      {
        id: 'u1',
        thread_id: 't1',
        author: 'user',
        visibility: 'normal',
        content: { text: 'hej' },
        created_at: 0,
      },
    ]
    expect(mapTimelineToChatMessages(messages)).toEqual([{ role: 'user', content: 'hej' }])
  })

  it('maps normal-visibility stina messages to role=assistant and skips silent ones', () => {
    const messages: Message[] = [
      {
        id: 's1',
        thread_id: 't1',
        author: 'stina',
        visibility: 'normal',
        content: { text: 'ok' },
        created_at: 0,
      },
      {
        id: 's2',
        thread_id: 't1',
        author: 'stina',
        visibility: 'silent',
        content: { text: 'internal note' },
        created_at: 1,
      },
    ]
    expect(mapTimelineToChatMessages(messages)).toEqual([{ role: 'assistant', content: 'ok' }])
  })

  it('wraps mail-kind app messages as system with the untrusted-data header', () => {
    const messages: Message[] = [
      {
        id: 'a1',
        thread_id: 't1',
        author: 'app',
        source: { extension_id: 'mail' },
        visibility: 'normal',
        content: {
          kind: 'mail',
          from: 'peter@example.com',
          subject: 'Q3 review',
          snippet: 'Can we sync?',
          mail_id: 'm-1',
        },
        created_at: 0,
      },
    ]
    const out = mapTimelineToChatMessages(messages)
    expect(out).toHaveLength(1)
    expect(out[0]!.role).toBe('system')
    expect(out[0]!.content).toMatch(/OPÅLITLIG EXTERN DATA/)
    expect(out[0]!.content).toContain('peter@example.com')
    expect(out[0]!.content).toContain('Q3 review')
    expect(out[0]!.content).toContain('Can we sync?')
  })
})

describe('createProviderProducer', () => {
  it('concatenates content events into the final reply text', async () => {
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf({ type: 'content', text: 'Hej ' }, { type: 'content', text: 'där.' }, { type: 'done' })
    const producer = createProviderProducer({ dispatcher })

    const out = await producer(makeContext({
      messages: [
        {
          id: 'u1',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'Hej!' },
          created_at: 0,
        },
      ],
    }))
    expect(out.visibility).toBe('normal')
    expect(out.content.text).toBe('Hej där.')
  })

  it('throws when the provider yields an error event', async () => {
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf({ type: 'content', text: 'partial' }, { type: 'error', message: 'boom' })
    const producer = createProviderProducer({ dispatcher })

    await expect(producer(makeContext())).rejects.toThrow(/boom/)
  })

  it('throws when the stream ends without a done event', async () => {
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf({ type: 'content', text: 'truncated' })
    const producer = createProviderProducer({ dispatcher })

    await expect(producer(makeContext())).rejects.toThrow(/done event/)
  })

  it('throws when the response is empty', async () => {
    const dispatcher: ChatStreamDispatcher = () => streamOf({ type: 'done' })
    const producer = createProviderProducer({ dispatcher })

    await expect(producer(makeContext())).rejects.toThrow(/empty response/)
  })

  it('passes model + settings + signal through to the dispatcher', async () => {
    const seen: { messages: ChatMessage[]; options: ChatOptions } = { messages: [], options: {} }
    const signal = new AbortController().signal
    const dispatcher: ChatStreamDispatcher = (messages, options) => {
      seen.messages = messages
      seen.options = options
      return streamOf({ type: 'content', text: 'ok' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      model: 'gpt-4o-mini',
      settings: { foo: 'bar' },
      signal,
    })

    await producer(makeContext({
      messages: [
        {
          id: 'u1',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'hej' },
          created_at: 0,
        },
      ],
    }))

    expect(seen.options.model).toBe('gpt-4o-mini')
    expect(seen.options.settings).toEqual({ foo: 'bar' })
    expect(seen.options.signal).toBe(signal)
  })

  it('puts a system prompt at index 0 followed by the mapped timeline', async () => {
    const seen: ChatMessage[] = []
    const dispatcher: ChatStreamDispatcher = (messages) => {
      seen.push(...messages)
      return streamOf({ type: 'content', text: 'ok' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      basePrompt: 'BASE-PROMPT',
    })

    await producer(makeContext({
      messages: [
        {
          id: 'u1',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'hej' },
          created_at: 0,
        },
        {
          id: 's1',
          thread_id: 't1',
          author: 'stina',
          visibility: 'normal',
          content: { text: 'tjena' },
          created_at: 1,
        },
        {
          id: 'u2',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'följdfråga' },
          created_at: 2,
        },
      ],
    }))

    expect(seen).toHaveLength(4)
    expect(seen[0]!.role).toBe('system')
    expect(seen[0]!.content).toBe('BASE-PROMPT')
    expect(seen[1]).toEqual({ role: 'user', content: 'hej' })
    expect(seen[2]).toEqual({ role: 'assistant', content: 'tjena' })
    expect(seen[3]).toEqual({ role: 'user', content: 'följdfråga' })
  })

  it('folds active standing instructions into the system prompt', async () => {
    let systemPrompt = ''
    const dispatcher: ChatStreamDispatcher = (messages) => {
      systemPrompt = messages[0]!.content
      return streamOf({ type: 'content', text: 'ok' }, { type: 'done' })
    }
    const producer = createProviderProducer({ dispatcher, basePrompt: 'BASE' })

    await producer(makeContext({
      memory: {
        active_instructions: [
          {
            id: 'i1',
            rule: 'svara på svenska',
            scope: {},
            valid_from: 0,
            valid_until: null,
            invalidate_on: [],
            source_thread_id: null,
            created_at: 0,
            created_by: 'user',
          },
        ],
        linked_facts: [],
      },
      messages: [
        {
          id: 'u1',
          thread_id: 't1',
          author: 'user',
          visibility: 'normal',
          content: { text: 'hej' },
          created_at: 0,
        },
      ],
    }))

    expect(systemPrompt).toContain('BASE')
    expect(systemPrompt).toContain('## Aktiva stående instruktioner')
    expect(systemPrompt).toContain('- svara på svenska')
  })

  it('without an executor, tool_start does not loop and the first iteration finalises', async () => {
    let dispatchCount = 0
    const dispatcher: ChatStreamDispatcher = () => {
      dispatchCount++
      return streamOf(
        { type: 'content', text: 'pre' },
        { type: 'tool_start', name: 'noop', input: {}, toolCallId: 'tc-1' },
        { type: 'done' }
      )
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'noop', name: 'noop', description: '', parameters: { type: 'object' } }],
    })

    const out = await producer(makeContext())
    expect(out.content.text).toBe('pre')
    expect(dispatchCount).toBe(1)
  })
})

describe('createProviderProducer — agentic tool loop', () => {
  it('executes a tool, feeds the result back, and loops to a final reply', async () => {
    const events: TurnStreamEvent[] = []
    const dispatchCalls: ChatMessage[][] = []

    let iter = 0
    const dispatcher: ChatStreamDispatcher = (messages) => {
      dispatchCalls.push([...messages])
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'echo', input: { foo: 'bar' }, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'final answer' }, { type: 'done' })
    }

    const executeTool: NonNullable<
      Parameters<typeof createProviderProducer>[0]['executeTool']
    > = async (name, params) => ({
      success: true,
      data: { tool: name, params },
    })

    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'echo', name: 'echo', description: '', parameters: { type: 'object' } }],
      executeTool,
    })

    const out = await producer(
      makeContext({ onStreamEvent: (e) => events.push(e) })
    )
    expect(out.content.text).toBe('final answer')
    expect(iter).toBe(2)

    // Second dispatch sees: original messages + assistant tool_calls + tool result.
    const second = dispatchCalls[1]!
    const assistantMsg = second.find((m) => m.role === 'assistant' && m.tool_calls)
    expect(assistantMsg).toBeDefined()
    const toolMsg = second.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.tool_call_id).toBe('tc-1')

    // Stream surfaced both tool_start and tool_end (executor-driven).
    expect(events.some((e) => e.type === 'tool_start' && e.name === 'echo')).toBe(true)
    const endEvent = events.find((e) => e.type === 'tool_end')
    expect(endEvent).toBeDefined()
    if (endEvent && endEvent.type === 'tool_end') {
      expect(endEvent.error).toBe(false)
    }
  })

  it('caps the loop at maxIterations', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      // Every iteration emits a tool call, never a final content-only turn.
      return streamOf(
        { type: 'tool_start', name: 'spin', input: {}, toolCallId: `tc-${iter}` },
        { type: 'content', text: `part-${iter}` },
        { type: 'done' }
      )
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'spin', name: 'spin', description: '', parameters: { type: 'object' } }],
      executeTool: async () => ({ success: true }),
      maxIterations: 3,
    })

    const out = await producer(makeContext())
    expect(iter).toBe(3)
    expect(out.content.text).toBe('part-1part-2part-3')
  })

  it('marks tool_end as error when the executor throws', async () => {
    const events: TurnStreamEvent[] = []
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'broken', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'ok' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'broken', name: 'broken', description: '', parameters: { type: 'object' } }],
      executeTool: async () => {
        throw new Error('explodes')
      },
    })
    const out = await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))
    expect(out.content.text).toBe('ok')
    const end = events.find((e) => e.type === 'tool_end')
    expect(end).toBeDefined()
    if (end && end.type === 'tool_end') {
      expect(end.error).toBe(true)
    }
  })

  it('attaches tool-declared severity to tool_start stream events', async () => {
    const events: TurnStreamEvent[] = []
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf(
        { type: 'tool_start', name: 'send_mail', input: {}, toolCallId: 'tc-1' },
        { type: 'content', text: 'sent' },
        { type: 'done' }
      )
    const producer = createProviderProducer({
      dispatcher,
      tools: [
        {
          id: 'send_mail',
          name: 'send_mail',
          description: '',
          parameters: { type: 'object' },
          severity: 'high',
        },
      ],
      executeTool: async () => ({ success: true }),
    })
    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))
    const start = events.find((e) => e.type === 'tool_start')
    expect(start).toBeDefined()
    if (start && start.type === 'tool_start') {
      expect(start.severity).toBe('high')
    }
  })

  it("defaults tool_start severity to 'medium' when the tool advertises none", async () => {
    const events: TurnStreamEvent[] = []
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf(
        { type: 'tool_start', name: 'noop', input: {}, toolCallId: 'tc-1' },
        { type: 'content', text: 'ok' },
        { type: 'done' }
      )
    const producer = createProviderProducer({
      dispatcher,
      tools: [
        { id: 'noop', name: 'noop', description: '', parameters: { type: 'object' } },
      ],
      executeTool: async () => ({ success: true }),
    })
    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))
    const start = events.find((e) => e.type === 'tool_start')
    expect(start).toBeDefined()
    if (start && start.type === 'tool_start') {
      expect(start.severity).toBe('medium')
    }
  })

  it("flags hallucinated tool names (not in opts.tools) with severity 'high'", async () => {
    const events: TurnStreamEvent[] = []
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf(
        { type: 'tool_start', name: 'unknown_tool', input: {}, toolCallId: 'tc-1' },
        { type: 'content', text: 'ok' },
        { type: 'done' }
      )
    const producer = createProviderProducer({
      dispatcher,
      tools: [
        { id: 'noop', name: 'noop', description: '', parameters: { type: 'object' } },
      ],
      executeTool: async () => ({ success: true }),
    })
    await producer(makeContext({ onStreamEvent: (e) => events.push(e) }))
    const start = events.find((e) => e.type === 'tool_start')
    expect(start).toBeDefined()
    if (start && start.type === 'tool_start') {
      expect(start.severity).toBe('high')
    }
  })

  it('passes tools through ChatOptions.tools on every dispatch', async () => {
    const tools = [
      { id: 'a', name: 'a', description: '', parameters: { type: 'object' } as const },
    ]
    const seen: Array<unknown> = []
    let iter = 0
    const dispatcher: ChatStreamDispatcher = (_msgs, options) => {
      seen.push(options.tools)
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'a', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'done' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools,
      executeTool: async () => ({ success: true }),
    })
    await producer(makeContext())
    expect(seen).toHaveLength(2)
    expect(seen[0]).toEqual(tools)
    expect(seen[1]).toEqual(tools)
  })
})

describe('createProviderProducer — tool call persistence', () => {
  it('no tools called → content.tool_calls is absent (not [])', async () => {
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf({ type: 'content', text: 'reply' }, { type: 'done' })
    const producer = createProviderProducer({ dispatcher })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toBeUndefined()
  })

  it('one successful low-severity tool → status done, severity low, correct name', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'read_file', input: { path: '/tmp/x' }, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'done' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'read_file', name: 'read_file', description: '', parameters: { type: 'object' }, severity: 'low' }],
      executeTool: async () => ({ success: true }),
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(1)
    const tc = out.content.tool_calls![0]!
    expect(tc.status).toBe('done')
    expect(tc.severity).toBe('low')
    expect(tc.name).toBe('read_file')
  })

  it('one errored tool → status error, error field populated', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'broken_tool', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'sorry' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'broken_tool', name: 'broken_tool', description: '', parameters: { type: 'object' } }],
      executeTool: async () => { throw new Error('disk full') },
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(1)
    const tc = out.content.tool_calls![0]!
    expect(tc.status).toBe('error')
    expect(tc.error).toMatch(/disk full/)
  })

  it('one blocked tool (high, no policy) → blocked, no_matching_policy, skip, severity high', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'send_mail', input: { to: 'x@y.com' }, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'could not send' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'send_mail', name: 'send_mail', description: '', parameters: { type: 'object' }, severity: 'high' }],
      // No lookupPolicy → high tool is blocked
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(1)
    const tc = out.content.tool_calls![0]!
    expect(tc.status).toBe('blocked')
    expect(tc.block_reason).toBe('no_matching_policy')
    expect(tc.chosen_alternative).toBe('skip')
    expect(tc.severity).toBe('high')
  })

  it('hallucinated tool → blocked, hallucinated_tool block_reason, severity high', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'unknown_tool', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'could not use' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'known_tool', name: 'known_tool', description: '', parameters: { type: 'object' } }],
      executeTool: async () => ({ success: true }),
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(1)
    const tc = out.content.tool_calls![0]!
    expect(tc.status).toBe('blocked')
    expect(tc.block_reason).toBe('hallucinated_tool')
    expect(tc.chosen_alternative).toBe('skip')
    expect(tc.severity).toBe('high')
  })

  it('critical tool → blocked, critical_severity block_reason', async () => {
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'nuke_db', input: {}, toolCallId: 'tc-1' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'could not proceed' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [{ id: 'nuke_db', name: 'nuke_db', description: '', parameters: { type: 'object' }, severity: 'critical' }],
      executeTool: async () => ({ success: true }),
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(1)
    const tc = out.content.tool_calls![0]!
    expect(tc.status).toBe('blocked')
    expect(tc.block_reason).toBe('critical_severity')
    expect(tc.chosen_alternative).toBe('skip')
    expect(tc.severity).toBe('critical')
  })

  it('interleaved blocked + executed in one iteration → persisted order matches tool_start stream order', async () => {
    // Stream order: exec_first (low), blocked_second (critical), exec_third (low)
    // blocked_second is pushed to slots at gate time; exec slots are filled after execution.
    // Expected persisted order: [exec_first, blocked_second, exec_third]
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'exec_first', input: {}, toolCallId: 'tc-1' },
          { type: 'tool_start', name: 'blocked_second', input: {}, toolCallId: 'tc-2' },
          { type: 'tool_start', name: 'exec_third', input: {}, toolCallId: 'tc-3' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'result' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [
        { id: 'exec_first', name: 'exec_first', description: '', parameters: { type: 'object' }, severity: 'low' },
        { id: 'blocked_second', name: 'blocked_second', description: '', parameters: { type: 'object' }, severity: 'critical' },
        { id: 'exec_third', name: 'exec_third', description: '', parameters: { type: 'object' }, severity: 'low' },
      ],
      executeTool: async () => ({ success: true }),
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(3)
    const calls = out.content.tool_calls!
    expect(calls[0]!.name).toBe('exec_first')
    expect(calls[0]!.status).toBe('done')
    expect(calls[1]!.name).toBe('blocked_second')
    expect(calls[1]!.status).toBe('blocked')
    expect(calls[2]!.name).toBe('exec_third')
    expect(calls[2]!.status).toBe('done')
  })

  it('multiple tools across two iterations → all collected, ordered correctly', async () => {
    // Iteration 1: tool_a (low, executed), tool_b (critical, blocked)
    // Iteration 2: tool_c (low, executed), final reply
    let iter = 0
    const dispatcher: ChatStreamDispatcher = () => {
      iter++
      if (iter === 1) {
        return streamOf(
          { type: 'tool_start', name: 'tool_a', input: {}, toolCallId: 'tc-a' },
          { type: 'tool_start', name: 'tool_b', input: {}, toolCallId: 'tc-b' },
          { type: 'done' }
        )
      }
      if (iter === 2) {
        return streamOf(
          { type: 'tool_start', name: 'tool_c', input: {}, toolCallId: 'tc-c' },
          { type: 'done' }
        )
      }
      return streamOf({ type: 'content', text: 'final' }, { type: 'done' })
    }
    const producer = createProviderProducer({
      dispatcher,
      tools: [
        { id: 'tool_a', name: 'tool_a', description: '', parameters: { type: 'object' }, severity: 'low' },
        { id: 'tool_b', name: 'tool_b', description: '', parameters: { type: 'object' }, severity: 'critical' },
        { id: 'tool_c', name: 'tool_c', description: '', parameters: { type: 'object' }, severity: 'low' },
      ],
      executeTool: async () => ({ success: true }),
    })
    const out = await producer(makeContext())
    expect(out.content.tool_calls).toHaveLength(3)
    const calls = out.content.tool_calls!
    expect(calls[0]!.name).toBe('tool_a')
    expect(calls[0]!.status).toBe('done')
    expect(calls[1]!.name).toBe('tool_b')
    expect(calls[1]!.status).toBe('blocked')
    expect(calls[2]!.name).toBe('tool_c')
    expect(calls[2]!.status).toBe('done')
  })
})
