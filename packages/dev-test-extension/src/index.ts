import {
  initializeExtension,
  type ExtensionContext,
  type Disposable,
} from '@stina/extension-api/runtime'

function activate(ctx: ExtensionContext): Disposable {
  if (!ctx.tools) {
    throw new Error('dev-test-extension requires the tools.register permission')
  }

  const highSeverityDisposable = ctx.tools.register({
    id: 'dev_test_high_severity_action',
    name: 'Dev Test: High-Severity Action',
    description: 'Fake high-severity tool for testing the §06 policy gate. Always succeeds.',
    async execute(_params) {
      return {
        success: true,
        data: { message: 'DEV tool executed — policy gate passed ✓' },
      }
    },
  })

  // Tool that emits a synthetic mail event via ctx.events.emitEvent.
  // Spawns a new mail-triggered thread in the inbox (§04 Phase 8a).
  // The tool's ctx is the activation-time ExtensionContext; events API
  // is available when `events.emit` permission is granted.
  const emitMailDisposable = ctx.tools.register({
    id: 'dev_test_emit_test_mail',
    name: 'Dev Test: Emit Test Mail',
    description: 'Emits a synthetic mail event, spawning a new mail-triggered thread.',
    async execute(_params) {
      if (!ctx.events) {
        throw new Error('dev_test_emit_test_mail requires the events.emit permission')
      }
      // Fresh mail_id per call so each invocation creates a distinct thread.
      const mail_id = `dev-test-mail-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

      const result = await ctx.events.emitEvent({
        trigger: {
          kind: 'mail',
          extension_id: 'dev-test', // host stamps this; value here is informational
          mail_id,
        },
        content: {
          kind: 'mail',
          from: 'fake@example.com',
          subject: 'Testmail från dev-test',
          snippet: 'Hej, det här är ett genererat testmail.',
          mail_id,
        },
        source: {
          extension_id: 'dev-test', // host stamps this too
          // No component — no UI component to attribute
        },
      })

      return {
        success: true,
        data: {
          thread_id: result.thread_id,
          message: `Ny mail-tråd skapad: ${result.thread_id}`,
        },
      }
    },
  })

  return {
    dispose: () => {
      highSeverityDisposable.dispose()
      emitMailDisposable.dispose()
    },
  }
}

initializeExtension({ activate })
