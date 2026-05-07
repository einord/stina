/**
 * Type-level test: the public extension-API `EmitEventInput` must NOT accept
 * `trigger.kind === 'stina'`. This confirms the trust boundary described in
 * §04 — extensions cannot impersonate runtime-origin events.
 *
 * Uses `@ts-expect-error` so a compile-time failure (should the type accidentally
 * widen) becomes a test failure at typecheck time, and a runtime no-op otherwise.
 */

import { describe, it } from 'vitest'
import type { EmitEventInput } from '../types.context.js'

describe('EmitEventInput type-level constraints', () => {
  it('does not accept trigger.kind === "stina" (compile-time enforcement)', () => {
    // The assignment below is invalid — 'stina' must not be assignable to
    // ExtensionThreadTrigger.kind. The @ts-expect-error must land on the same
    // logical expression the error is reported on.
    const _trigger = { kind: 'stina' as const, reason: 'dream_pass_insight' as const }
    // @ts-expect-error — 'stina' kind is not assignable to ExtensionThreadTrigger
    const _input: EmitEventInput['trigger'] = _trigger
    void _input
  })

  it('does not accept trigger.kind === "user" (compile-time enforcement)', () => {
    const _trigger = { kind: 'user' as const }
    // @ts-expect-error — 'user' kind is not assignable to ExtensionThreadTrigger
    const _input: EmitEventInput['trigger'] = _trigger
    void _input
  })
})
