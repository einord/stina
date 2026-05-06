import {
  initializeExtension,
  type ExtensionContext,
  type Disposable,
  type EmitEventInput,
} from '@stina/extension-api/runtime'

function freshId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Build a synthetic mail emit payload. Used by both the tool form (for
 * Stina-driven testing) and the action form (for UI-button-driven testing).
 */
function buildTestMailInput(): EmitEventInput {
  const mail_id = freshId('dev-test-mail')
  return {
    trigger: { kind: 'mail', extension_id: 'dev-test', mail_id },
    content: {
      kind: 'mail',
      from: 'fake@example.com',
      subject: 'Testmail från dev-test',
      snippet: 'Hej, det här är ett genererat testmail.',
      mail_id,
    },
    source: { extension_id: 'dev-test' },
  }
}

function buildTestCalendarInput(): EmitEventInput {
  const event_id = freshId('dev-test-cal')
  const starts_at = Date.now() + 30 * 60 * 1000
  const ends_at = starts_at + 60 * 60 * 1000
  return {
    trigger: { kind: 'calendar', extension_id: 'dev-test', event_id },
    content: {
      kind: 'calendar',
      title: 'Testmöte från dev-test',
      starts_at,
      ends_at,
      location: 'Konferensrum A',
      event_id,
    },
    source: { extension_id: 'dev-test' },
  }
}

function buildTestScheduledInput(): EmitEventInput {
  const job_id = freshId('dev-test-job')
  return {
    trigger: { kind: 'scheduled', job_id },
    content: {
      kind: 'scheduled',
      job_id,
      description: 'Schemalagt testjobb från dev-test',
    },
    source: { extension_id: 'dev-test' },
  }
}

function activate(ctx: ExtensionContext): Disposable {
  if (!ctx.tools) {
    throw new Error('dev-test-extension requires the tools.register permission')
  }
  if (!ctx.events) {
    throw new Error('dev-test-extension requires the events.emit permission')
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

  // Stina-driven path: Stina calls this tool to spawn a mail-triggered thread.
  const emitMailDisposable = ctx.tools.register({
    id: 'dev_test_emit_test_mail',
    name: 'Dev Test: Emit Test Mail',
    description: 'Emits a synthetic mail event, spawning a new mail-triggered thread.',
    async execute(_params) {
      const result = await ctx.events!.emitEvent(buildTestMailInput())
      return {
        success: true,
        data: {
          thread_id: result.thread_id,
          message: `Ny mail-tråd skapad: ${result.thread_id}`,
        },
      }
    },
  })

  // UI-driven path: actions registered for the toolSettings buttons in
  // Inställningar → Verktyg → "Dev Test — utlös testevents". Lets the
  // user trigger event spawning without a model in the loop.
  if (!ctx.actions) {
    throw new Error('dev-test-extension requires the actions.register permission')
  }
  const emitMailActionDisposable = ctx.actions.register({
    id: 'emit_test_mail',
    async execute(_params) {
      const result = await ctx.events!.emitEvent(buildTestMailInput())
      return { success: true, data: { thread_id: result.thread_id } }
    },
  })
  const emitCalendarActionDisposable = ctx.actions.register({
    id: 'emit_test_calendar',
    async execute(_params) {
      const result = await ctx.events!.emitEvent(buildTestCalendarInput())
      return { success: true, data: { thread_id: result.thread_id } }
    },
  })
  const emitScheduledActionDisposable = ctx.actions.register({
    id: 'emit_test_scheduled',
    async execute(_params) {
      const result = await ctx.events!.emitEvent(buildTestScheduledInput())
      return { success: true, data: { thread_id: result.thread_id } }
    },
  })

  return {
    dispose: () => {
      highSeverityDisposable.dispose()
      emitMailDisposable.dispose()
      emitMailActionDisposable.dispose()
      emitCalendarActionDisposable.dispose()
      emitScheduledActionDisposable.dispose()
    },
  }
}

initializeExtension({ activate })
