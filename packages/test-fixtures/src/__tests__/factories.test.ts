import { describe, it, expect } from 'vitest'
import {
  FIXTURE_NOW_MS,
  daysAgo,
  daysAhead,
  hoursAgo,
  makeActivityLogEntry,
  makeAppContent,
  makeAppMessage,
  makeAutoPolicy,
  makeBackgroundThread,
  makeProfileFact,
  makeStandingInstruction,
  makeStinaMessage,
  makeSurfacedThread,
  makeThread,
  makeThreadSummary,
  makeUserMessage,
  makeVacationInstruction,
} from '../factories/index.js'

describe('deterministic helpers', () => {
  it('FIXTURE_NOW_MS is a fixed point in time', () => {
    expect(FIXTURE_NOW_MS).toBe(Date.UTC(2026, 4, 4, 8, 0, 0))
  })

  it('hoursAgo and daysAgo produce decreasing offsets', () => {
    expect(hoursAgo(1)).toBeLessThan(FIXTURE_NOW_MS)
    expect(daysAgo(1)).toBeLessThan(hoursAgo(1))
  })

  it('daysAhead produces future timestamps', () => {
    expect(daysAhead(1)).toBeGreaterThan(FIXTURE_NOW_MS)
  })
})

describe('makeThread', () => {
  it('produces an active background thread by default', () => {
    const t = makeThread()
    expect(t.status).toBe('active')
    expect(t.surfaced_at).toBeNull()
    expect(t.notified_at).toBeNull()
    expect(t.linked_entities).toEqual([])
  })

  it('respects overrides', () => {
    const t = makeThread({
      title: 'Custom title',
      trigger: { kind: 'mail', extension_id: 'ext', mail_id: 'm1' },
    })
    expect(t.title).toBe('Custom title')
    expect(t.trigger).toEqual({ kind: 'mail', extension_id: 'ext', mail_id: 'm1' })
  })
})

describe('makeSurfacedThread / makeBackgroundThread / makeQuietThread', () => {
  it('makeSurfacedThread sets both surfaced_at and notified_at', () => {
    const t = makeSurfacedThread()
    expect(t.surfaced_at).not.toBeNull()
    expect(t.notified_at).not.toBeNull()
  })

  it('makeBackgroundThread keeps both null', () => {
    const t = makeBackgroundThread()
    expect(t.surfaced_at).toBeNull()
    expect(t.notified_at).toBeNull()
  })
})

describe('makeAppContent', () => {
  it('builds a typed mail payload', () => {
    const c = makeAppContent('mail', { subject: 'Q3' })
    expect(c.kind).toBe('mail')
    if (c.kind === 'mail') {
      expect(c.subject).toBe('Q3')
      expect(c.from).toBe('peter@example.com')
    }
  })

  it('builds a typed calendar payload with location', () => {
    const c = makeAppContent('calendar', { location: 'Hörsal B' })
    expect(c.kind).toBe('calendar')
    if (c.kind === 'calendar') {
      expect(c.location).toBe('Hörsal B')
    }
  })

  it('builds a system payload', () => {
    const c = makeAppContent('system', { message: 'Test' })
    expect(c.kind).toBe('system')
    if (c.kind === 'system') {
      expect(c.message).toBe('Test')
    }
  })
})

describe('makeMessage', () => {
  it('user message defaults', () => {
    const m = makeUserMessage()
    expect(m.author).toBe('user')
    expect(m.visibility).toBe('normal')
  })

  it('stina message defaults', () => {
    const m = makeStinaMessage()
    expect(m.author).toBe('stina')
  })

  it('app message requires content', () => {
    const m = makeAppMessage({
      thread_id: 't',
      content: makeAppContent('mail'),
    })
    expect(m.author).toBe('app')
    expect(m.source.extension_id).toBe('stina-ext-mail')
    expect(m.content.kind).toBe('mail')
  })
})

describe('makeStandingInstruction', () => {
  it('defaults to user-set indefinite instruction', () => {
    const si = makeStandingInstruction()
    expect(si.created_by).toBe('user')
    expect(si.valid_until).toBeNull()
  })

  it('makeVacationInstruction has a date_passed invalidation condition', () => {
    const si = makeVacationInstruction()
    expect(si.invalidate_on.some((c) => c.kind === 'date_passed')).toBe(true)
    expect(si.valid_until).not.toBeNull()
  })
})

describe('makeProfileFact + makeThreadSummary', () => {
  it('profile fact defaults to stina-extracted', () => {
    const f = makeProfileFact()
    expect(f.created_by).toBe('stina')
    expect(f.subject).toBe('user')
  })

  it('thread summary requires a thread_id', () => {
    const ts = makeThreadSummary({ thread_id: 'tx-1' })
    expect(ts.thread_id).toBe('tx-1')
    expect(ts.topics.length).toBeGreaterThan(0)
  })
})

describe('makeAutoPolicy + makeActivityLogEntry', () => {
  it('auto policy mode is always inform', () => {
    const p = makeAutoPolicy()
    expect(p.mode).toBe('inform')
  })

  it('activity log entry defaults severity per kind', () => {
    expect(makeActivityLogEntry('event_silenced').severity).toBe('low')
    expect(makeActivityLogEntry('auto_action').severity).toBe('high')
    expect(makeActivityLogEntry('memory_change').severity).toBe('medium')
    expect(makeActivityLogEntry('action_blocked').severity).toBe('high')
  })

  it('activity log details include traceability for tool-driven kinds', () => {
    const e = makeActivityLogEntry('auto_action')
    expect(e.details).toMatchObject({
      tool_id: 'mail.reply',
      policy_id: expect.any(String),
    })
  })
})
