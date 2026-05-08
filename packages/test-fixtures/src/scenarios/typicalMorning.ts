import {
  daysAgo,
  hoursAgo,
  makeActivityLogEntry,
  makeAppContent,
  makeAppMessage,
  makeBackgroundThread,
  makeEntityRef,
  makeProfileFact,
  makeQuietThread,
  makeStandingInstruction,
  makeStinaMessage,
  makeSurfacedThread,
  makeThreadSummary,
  minutesAgo,
} from '../factories/index.js'
import type { Scenario } from './types.js'

/**
 * Typical morning scenario.
 *
 * The user opens the app for the first time today. The inbox shows:
 * - Today's recap thread at the top (Stina-triggered, surfaced)
 * - One active mail thread that needs the user's attention
 * - Two background threads that Stina handled silently overnight
 * - A few older quiet threads from earlier in the week
 * - One archived thread (older)
 *
 * Plus: a couple of standing instructions, a few profile facts, thread
 * summaries for the quiet threads, and a populated activity log spanning
 * memory_change, auto_action, event_silenced, dream_pass_run.
 *
 * This is the "default" UI development scenario — exercises every segment,
 * card style, and inline-rendering case from §05.
 */
export function typicalMorning(): Scenario {
  // Stable IDs for cross-references between threads, instructions, etc.
  const recapId = 'morning-recap-001'
  const customerMailId = 'morning-mail-001'
  const newsletterMailId = 'morning-mail-002'
  const cancelledCalId = 'morning-cal-001'
  const projectQuietId = 'morning-quiet-001'
  const flightQuietId = 'morning-quiet-002'
  const archivedId = 'morning-archived-001'
  const managerInstrId = 'morning-instr-001'
  const newsletterInstrId = 'morning-instr-002'
  const peterFactId = 'morning-fact-001'
  const annaFactId = 'morning-fact-002'
  const projectFactId = 'morning-fact-003'
  const replyPolicyId = 'morning-policy-001'

  // ─── Recap thread ──────────────────────────────────────────────────
  const recapThread = makeSurfacedThread({
    id: recapId,
    trigger: { kind: 'stina', reason: 'recap' },
    title: 'God morgon — lugnt tempo idag',
    created_at: hoursAgo(0.5),
    surfaced_at: hoursAgo(0.5),
    notified_at: hoursAgo(0.5),
    last_activity_at: hoursAgo(0.5),
  })

  const recapMessage = makeStinaMessage({
    id: 'morning-recap-msg-001',
    thread_id: recapId,
    content: {
      text:
        'God morgon! Två mail i natt. Det ena från Hannes om Q2-planen — ' +
        'jag svarade automatiskt enligt din semesterregel. Det andra var ' +
        'ett nyhetsbrev som jag lät vara. En kalenderhändelse ställdes in ' +
        'imorgon, vill du veta mer? Allt verkar lugnt annars.',
    },
    created_at: hoursAgo(0.5),
  })

  // ─── Active surfaced mail thread (customer escalation) ───────────────
  const customerThread = makeSurfacedThread({
    id: customerMailId,
    // extension_id 'dev-test' so this thread renders with dev-test hints (plum bordered, 🧪, DEV badge).
    trigger: { kind: 'mail', extension_id: 'dev-test', mail_id: 'm-customer-1' },
    title: 'Kundärende: Akut frågor om leverans',
    created_at: hoursAgo(2),
    surfaced_at: hoursAgo(2),
    notified_at: hoursAgo(2),
    last_activity_at: hoursAgo(2),
    linked_entities: [
      makeEntityRef({
        kind: 'person',
        ref_id: 'customer-1',
        snapshot: { display: 'Anna Lindblom (kund)', excerpt: 'Akut leveransfråga' },
      }),
    ],
  })

  const customerAppMessage = makeAppMessage({
    thread_id: customerMailId,
    source: { extension_id: 'stina-ext-mail' },
    content: makeAppContent('mail', {
      from: 'anna.lindblom@kund.se',
      subject: 'Akut: leveransen',
      snippet: 'Hej, vi behöver ett besked om leveransen senast idag…',
      mail_id: 'm-customer-1',
    }),
    created_at: hoursAgo(2),
  })

  const customerStinaMessage = makeStinaMessage({
    thread_id: customerMailId,
    content: {
      text:
        'Det här ser ut som ett kundärende som verkar brådskande, så jag ' +
        'tog inte det automatiskt. Vill du att jag förbereder ett svar?',
    },
    created_at: hoursAgo(2),
  })

  // ─── Background mail thread (auto-replied via vacation policy) ──────
  const newsletterThread = makeBackgroundThread({
    id: newsletterMailId,
    trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'm-news-1' },
    title: 'Nyhetsbrev: Veckans rapport',
    status: 'quiet',
    created_at: hoursAgo(8),
    last_activity_at: hoursAgo(8),
  })

  const newsletterAppMessage = makeAppMessage({
    thread_id: newsletterMailId,
    content: makeAppContent('mail', {
      from: 'news@exempel.se',
      subject: 'Veckans rapport',
      snippet: 'Här är veckans sammanfattning…',
      mail_id: 'm-news-1',
    }),
    created_at: hoursAgo(8),
  })

  // ─── Background calendar thread (cancelled meeting) ─────────────────
  const cancelledThread = makeBackgroundThread({
    id: cancelledCalId,
    // extension_id 'dev-test' so this thread also renders with dev-test hints (plum bordered, 🧪, DEV badge).
    trigger: { kind: 'calendar', extension_id: 'dev-test', event_id: 'e-cancel-1' },
    title: 'Möte inställt: Sprint review',
    status: 'quiet',
    created_at: hoursAgo(10),
    last_activity_at: hoursAgo(10),
  })

  const cancelledAppMessage = makeAppMessage({
    thread_id: cancelledCalId,
    source: { extension_id: 'stina-ext-calendar' },
    content: makeAppContent('calendar', {
      title: 'Sprint review (INSTÄLLT)',
      starts_at: hoursAgo(-24),
      ends_at: hoursAgo(-23),
      location: 'Konferensrum 2',
      event_id: 'e-cancel-1',
    }),
    created_at: hoursAgo(10),
  })

  // ─── Older quiet threads (project + travel) ─────────────────────────
  const projectThread = makeQuietThread({
    id: projectQuietId,
    title: 'Diskussion om Q2-planen',
    created_at: daysAgo(3),
    surfaced_at: daysAgo(3),
    last_activity_at: daysAgo(2),
  })

  const flightThread = makeQuietThread({
    id: flightQuietId,
    title: 'Resa till Berlin på fredag',
    created_at: daysAgo(5),
    surfaced_at: daysAgo(5),
    last_activity_at: daysAgo(4),
  })

  // ─── Archived thread ───────────────────────────────────────────────
  const archivedThread = makeSurfacedThread({
    id: archivedId,
    status: 'archived',
    title: 'Bokade tandläkarbesök',
    created_at: daysAgo(20),
    surfaced_at: daysAgo(20),
    last_activity_at: daysAgo(20),
  })

  // ─── Standing instructions ─────────────────────────────────────────
  const managerInstr = makeStandingInstruction({
    id: managerInstrId,
    rule: 'Notify me about mails from my manager Peter.',
    scope: { channels: ['mail'], match: { from: 'peter@example.com' } },
    valid_from: daysAgo(30),
    created_by: 'user',
  })

  const newsletterInstr = makeStandingInstruction({
    id: newsletterInstrId,
    rule: "Don't surface newsletter mails — keep them in the background.",
    scope: { channels: ['mail'] },
    valid_from: daysAgo(14),
    created_by: 'stina',
  })

  // ─── Profile facts ─────────────────────────────────────────────────
  const peterFact = makeProfileFact({
    id: peterFactId,
    fact: "Peter Andersson is the user's manager.",
    subject: 'user',
    predicate: 'manager_is',
    created_by: 'stina',
    created_at: daysAgo(45),
    last_referenced_at: hoursAgo(2),
  })

  const annaFact = makeProfileFact({
    id: annaFactId,
    fact: "The user's spouse is Anna.",
    subject: 'user',
    predicate: 'spouse_is',
    created_by: 'user',
    created_at: daysAgo(60),
    last_referenced_at: daysAgo(7),
  })

  const projectFact = makeProfileFact({
    id: projectFactId,
    fact: 'The user prefers concise written summaries over long ones.',
    subject: 'user',
    predicate: 'prefers',
    created_by: 'stina',
    created_at: daysAgo(20),
    last_referenced_at: daysAgo(1),
  })

  // ─── Thread summaries ──────────────────────────────────────────────
  const projectSummary = makeThreadSummary({
    thread_id: projectQuietId,
    summary: 'Discussion of the Q2 plan. Agreed the deadline shifts to Friday.',
    topics: ['q2-plan', 'deadlines'],
    generated_at: daysAgo(2),
    message_count_at_generation: 14,
  })

  const flightSummary = makeThreadSummary({
    thread_id: flightQuietId,
    summary: 'Flight to Berlin Friday morning; hotel booked Thursday-Saturday.',
    topics: ['travel', 'berlin'],
    generated_at: daysAgo(4),
    message_count_at_generation: 9,
  })

  // ─── Auto-policy ────────────────────────────────────────────────────
  const replyPolicy = {
    id: replyPolicyId,
    tool_id: 'mail.reply',
    scope: { standing_instruction_id: managerInstrId },
    mode: 'inform' as const,
    created_at: daysAgo(15),
    source_thread_id: null,
    approval_count: 7,
    created_by_suggestion: true,
  }

  // ─── Activity log entries ──────────────────────────────────────────
  const dreamRun = makeActivityLogEntry('dream_pass_run', {
    id: 'morning-dream-001',
    thread_id: null,
    summary: 'Nattens konsolidering klar — 3 trådar sammanfattade, 1 minne flaggat.',
    created_at: hoursAgo(6),
    details: {
      status: 'completed',
      tasks: { summarized: 3, expired: 0, flags: 1 },
      usage: { tokens: 7920 },
    },
  })

  const dreamFlag = makeActivityLogEntry('dream_pass_flag', {
    id: 'morning-flag-001',
    thread_id: null,
    summary: 'En faktum om Peter har inte refererats på 6 månader.',
    created_at: hoursAgo(6),
    details: {
      flag_kind: 'stale_fact',
      dedup_key: 'stale_fact:morning-fact-001',
      profile_fact_id: peterFactId,
    },
  })

  const memoryChange = makeActivityLogEntry('memory_change', {
    id: 'morning-mem-001',
    thread_id: customerMailId,
    summary: 'Sparat: kunden Anna Lindblom som kontakt.',
    severity: 'medium',
    created_at: hoursAgo(2),
    details: { memory_kind: 'profile_fact', action: 'create' },
  })

  const eventSilenced = makeActivityLogEntry('event_silenced', {
    id: 'morning-silenced-001',
    thread_id: newsletterMailId,
    summary: 'Nyhetsbrev — bakgrund per din regel om nyhetsbrev.',
    created_at: hoursAgo(8),
    details: { reason: 'matches newsletter standing instruction' },
  })

  const eventSilencedCalendar = makeActivityLogEntry('event_silenced', {
    id: 'morning-silenced-002',
    thread_id: cancelledCalId,
    summary: 'Inställt möte — bakgrund eftersom det inte krävde åtgärd.',
    created_at: hoursAgo(10),
    details: { reason: 'cancellation; nothing for the user to do' },
  })

  const autoAction = makeActivityLogEntry('auto_action', {
    id: 'morning-auto-001',
    thread_id: customerMailId,
    summary: 'Auto-svarade på mail från Hannes per semesterregel.',
    severity: 'high',
    created_at: minutesAgo(45),
    details: {
      tool_id: 'mail.reply',
      policy_id: replyPolicyId,
      standing_instruction_id: managerInstrId,
    },
  })

  return {
    id: 'typical-morning',
    description:
      'Realistic morning state: recap on top, one active surfaced mail, two ' +
      'background threads, older quiet threads, one archived. Exercises ' +
      'every segment and rendering case from §05.',
    threads: [
      recapThread,
      customerThread,
      newsletterThread,
      cancelledThread,
      projectThread,
      flightThread,
      archivedThread,
    ],
    messages: [
      recapMessage,
      customerAppMessage,
      customerStinaMessage,
      newsletterAppMessage,
      cancelledAppMessage,
    ],
    standing_instructions: [managerInstr, newsletterInstr],
    profile_facts: [peterFact, annaFact, projectFact],
    thread_summaries: [projectSummary, flightSummary],
    auto_policies: [replyPolicy],
    activity_log_entries: [
      dreamRun,
      dreamFlag,
      memoryChange,
      eventSilenced,
      eventSilencedCalendar,
      autoAction,
    ],
  }
}
