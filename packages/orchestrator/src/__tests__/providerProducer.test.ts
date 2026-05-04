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

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't1',
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

  it('ignores thinking and tool events in v1', async () => {
    const dispatcher: ChatStreamDispatcher = () =>
      streamOf(
        { type: 'thinking', text: 'considering' },
        { type: 'content', text: 'A' },
        { type: 'tool_start', name: 'noop', input: {}, toolCallId: 'tc-1' },
        { type: 'content', text: 'B' },
        { type: 'tool_end', name: 'noop', output: {}, toolCallId: 'tc-1' },
        { type: 'done' }
      )
    const producer = createProviderProducer({ dispatcher })

    const out = await producer(makeContext())
    expect(out.content.text).toBe('AB')
  })
})
