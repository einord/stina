/**
 * Unit tests for deriveLinkedEntities (§04 phase 8d).
 *
 * Pure function — no DB, no extension host, no IO.
 */

import { describe, it, expect } from 'vitest'
import { deriveLinkedEntities } from '../ExtensionHost.handlers.events.js'
import type { EmitThreadEventInput } from '../ExtensionHost.handlers.events.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mailInput(overrides: Partial<{
  from: string
  subject: string
  snippet: string
  extension_id: string
  mail_id: string
}>): EmitThreadEventInput {
  const extensionId = overrides.extension_id ?? 'stina-ext-mail'
  const mail_id = overrides.mail_id ?? 'mail-001'
  return {
    trigger: { kind: 'mail', extension_id: extensionId, mail_id },
    content: {
      kind: 'mail',
      from: overrides.from ?? 'sender@example.com',
      subject: overrides.subject ?? 'Hello',
      snippet: overrides.snippet ?? 'Short snippet.',
      mail_id,
    },
    source: { extension_id: extensionId },
  }
}

function calendarInput(overrides: Partial<{
  title: string
  event_id: string
  starts_at: number
  ends_at: number
  location: string
  extension_id: string
}>): EmitThreadEventInput {
  const extensionId = overrides.extension_id ?? 'stina-ext-calendar'
  return {
    trigger: { kind: 'calendar', extension_id: extensionId, event_id: overrides.event_id ?? 'evt-001' },
    content: {
      kind: 'calendar',
      title: overrides.title ?? 'Team meeting',
      starts_at: overrides.starts_at ?? new Date('2026-05-07T09:00:00Z').getTime(),
      ends_at: overrides.ends_at ?? new Date('2026-05-07T10:00:00Z').getTime(),
      event_id: overrides.event_id ?? 'evt-001',
      ...(overrides.location !== undefined ? { location: overrides.location } : {}),
    },
    source: { extension_id: extensionId },
  }
}

function scheduledInput(): EmitThreadEventInput {
  return {
    trigger: { kind: 'scheduled', job_id: 'job-001' },
    content: { kind: 'scheduled', job_id: 'job-001', description: 'Nightly sync' },
    source: { extension_id: 'stina-ext-scheduler' },
  }
}

// ─── mail tests ──────────────────────────────────────────────────────────────

describe('deriveLinkedEntities — mail', () => {
  it('bare email: produces one person ref with lowercased email as ref_id and display', () => {
    const refs = deriveLinkedEntities(mailInput({ from: 'Alice@Example.COM' }))

    expect(refs).toHaveLength(1)
    const ref = refs[0]!
    expect(ref.kind).toBe('person')
    expect(ref.ref_id).toBe('alice@example.com')
    expect(ref.snapshot.display).toBe('alice@example.com')
  })

  it('named format "Name <email>": ref_id is lowercased email, display is the name portion', () => {
    const refs = deriveLinkedEntities(mailInput({ from: 'Peter Andersson <Peter@Example.com>' }))

    expect(refs).toHaveLength(1)
    const ref = refs[0]!
    expect(ref.kind).toBe('person')
    expect(ref.ref_id).toBe('peter@example.com')
    expect(ref.snapshot.display).toBe('Peter Andersson')
  })

  it('named format: same ref_id regardless of address casing (canonicalization)', () => {
    const refsBare = deriveLinkedEntities(mailInput({ from: 'PETER@EXAMPLE.COM' }))
    const refsNamed = deriveLinkedEntities(mailInput({ from: 'Peter <PETER@EXAMPLE.COM>' }))
    expect(refsBare[0]!.ref_id).toBe(refsNamed[0]!.ref_id)
  })

  it('malformed from (no @): does not throw, uses lowercased raw string as ref_id, raw trimmed string as display', () => {
    expect(() => deriveLinkedEntities(mailInput({ from: '  No-At-Sign-Here  ' }))).not.toThrow()

    const refs = deriveLinkedEntities(mailInput({ from: '  No-At-Sign-Here  ' }))
    expect(refs).toHaveLength(1)
    expect(refs[0]!.ref_id).toBe('no-at-sign-here')
    expect(refs[0]!.snapshot.display).toBe('No-At-Sign-Here')
  })

  it('named format: snapshot.excerpt uses raw from string (preserves human-readable angle-bracket form)', () => {
    const refs = deriveLinkedEntities(mailInput({
      from: 'Peter Andersson <peter@example.com>',
      subject: 'Hej',
      snippet: 'Hej hej',
    }))
    expect(refs[0]!.snapshot.excerpt).toBe('Peter Andersson <peter@example.com>: Hej\nHej hej')
  })

  it('snapshot.excerpt is "from: subject\\nsnippet"', () => {
    const refs = deriveLinkedEntities(mailInput({
      from: 'alice@example.com',
      subject: 'Hej!',
      snippet: 'Hur mår du?',
    }))
    expect(refs[0]!.snapshot.excerpt).toBe('alice@example.com: Hej!\nHur mår du?')
  })

  it('snapshot.excerpt is truncated to ≤ 200 codepoints on overflow', () => {
    const longSubject = 'S'.repeat(300)
    const refs = deriveLinkedEntities(mailInput({
      from: 'a@b.com',
      subject: longSubject,
      snippet: 'short',
    }))
    const codepoints = [...(refs[0]!.snapshot.excerpt ?? '')]
    expect(codepoints.length).toBeLessThanOrEqual(200)
    expect(refs[0]!.snapshot.excerpt!.endsWith('…')).toBe(true)
  })

  it('extension_id on the ref matches trigger.extension_id', () => {
    const refs = deriveLinkedEntities(mailInput({ extension_id: 'my-mail-ext' }))
    expect(refs[0]!.extension_id).toBe('my-mail-ext')
  })
})

// ─── calendar tests ───────────────────────────────────────────────────────────

describe('deriveLinkedEntities — calendar', () => {
  it('produces one calendar_event ref with event_id as ref_id and title as display', () => {
    const refs = deriveLinkedEntities(calendarInput({ event_id: 'cal-123', title: 'Sprint review' }))

    expect(refs).toHaveLength(1)
    const ref = refs[0]!
    expect(ref.kind).toBe('calendar_event')
    expect(ref.ref_id).toBe('cal-123')
    expect(ref.snapshot.display).toBe('Sprint review')
  })

  it('snapshot.excerpt contains title and ISO-formatted start time', () => {
    const starts_at = new Date('2026-05-07T09:00:00.000Z').getTime()
    const refs = deriveLinkedEntities(calendarInput({ title: 'Standup', starts_at }))
    expect(refs[0]!.snapshot.excerpt).toContain('Standup')
    expect(refs[0]!.snapshot.excerpt).toContain('2026-05-07T09:00:00.000Z')
  })

  it('snapshot.excerpt includes location when present', () => {
    const refs = deriveLinkedEntities(calendarInput({ title: 'Offsite', location: 'Stockholm' }))
    expect(refs[0]!.snapshot.excerpt).toContain('Stockholm')
  })

  it('snapshot.excerpt omits location separator when location is absent', () => {
    const refs = deriveLinkedEntities(calendarInput({ title: 'Solo meeting' }))
    // No location — should not contain an extra ' · '
    const parts = (refs[0]!.snapshot.excerpt ?? '').split(' · ')
    expect(parts.length).toBe(2) // title + time only
  })

  it('extension_id on the ref matches trigger.extension_id', () => {
    const refs = deriveLinkedEntities(calendarInput({ extension_id: 'my-cal-ext' }))
    expect(refs[0]!.extension_id).toBe('my-cal-ext')
  })
})

// ─── scheduled tests ──────────────────────────────────────────────────────────

describe('deriveLinkedEntities — scheduled', () => {
  it('returns an empty array — job_id is not a domain entity', () => {
    const refs = deriveLinkedEntities(scheduledInput())
    expect(refs).toEqual([])
  })
})
