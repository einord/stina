import {
  daysAgo,
  hoursAgo,
  makeActivityLogEntry,
  makeAppContent,
  makeAppMessage,
  makeAutoPolicy,
  makeBackgroundThread,
  makeProfileFact,
  makeStinaMessage,
  makeSurfacedThread,
  makeVacationInstruction,
} from '../factories/index.js'
import type { Scenario } from './types.js'

/**
 * Vacation-mode-active scenario.
 *
 * The user is on vacation. A vacation auto-reply standing instruction is
 * active, with a matching auto-policy authorizing Stina to send the replies
 * silently. Five mails arrived overnight; four were auto-replied (background
 * threads with `auto_action` log entries), one was flagged as a customer
 * escalation and surfaced for the user.
 *
 * Useful for: testing the high-volume auto-action recap rendering,
 * standing-instruction-driven background activity, and the §06 collision
 * handling where a `high` action is surfaced because the policy didn't cover
 * the exceptional case.
 */
export function vacationModeActive(): Scenario {
  const recapId = 'vac-recap-001'
  const escalationMailId = 'vac-mail-escalation-001'
  const autoMailIds = ['vac-mail-auto-001', 'vac-mail-auto-002', 'vac-mail-auto-003', 'vac-mail-auto-004']
  const vacationInstrId = 'vac-instr-001'
  const peterFactId = 'vac-fact-001'
  const replyPolicyId = 'vac-policy-001'

  // ─── Standing instruction + policy ──────────────────────────────────
  const vacationInstr = makeVacationInstruction({
    id: vacationInstrId,
    rule:
      "I'm on vacation until next Monday. Auto-reply to work mail saying " +
      "I'll respond when I'm back. Customer escalations should be surfaced.",
    created_by: 'user',
  })

  const replyPolicy = makeAutoPolicy({
    id: replyPolicyId,
    tool_id: 'mail.reply',
    scope: { standing_instruction_id: vacationInstrId },
    created_at: hoursAgo(48),
    approval_count: 0,
    created_by_suggestion: false,
  })

  const peterFact = makeProfileFact({
    id: peterFactId,
    fact: "Peter Andersson is the user's manager.",
    subject: 'user',
    predicate: 'manager_is',
    created_by: 'stina',
    created_at: daysAgo(60),
  })

  // ─── Recap ──────────────────────────────────────────────────────────
  const recapThread = makeSurfacedThread({
    id: recapId,
    trigger: { kind: 'stina', reason: 'recap' },
    title: 'God morgon — fyra mail hanterade i natt',
    created_at: hoursAgo(0.5),
    surfaced_at: hoursAgo(0.5),
    notified_at: hoursAgo(0.5),
    last_activity_at: hoursAgo(0.5),
  })

  const recapMessage = makeStinaMessage({
    id: 'vac-recap-msg-001',
    thread_id: recapId,
    content: {
      text:
        'Du fick fem mail i natt. Fyra av dem svarade jag på automatiskt ' +
        'med ditt semestermeddelande — alla från kollegor om interna ' +
        'frågor. Det femte var ett kundärende som verkade brådskande, så ' +
        'jag valde att inte svara automatiskt och lyfte fram det till dig.',
    },
    created_at: hoursAgo(0.5),
  })

  // ─── Customer escalation (surfaced via collision handling) ──────────
  const escalationThread = makeSurfacedThread({
    id: escalationMailId,
    trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: 'm-esc-1' },
    title: 'Kundärende: Akut frågor om leverans',
    created_at: hoursAgo(3),
    surfaced_at: hoursAgo(3),
    notified_at: hoursAgo(3),
    last_activity_at: hoursAgo(3),
  })

  const escalationAppMessage = makeAppMessage({
    thread_id: escalationMailId,
    content: makeAppContent('mail', {
      from: 'kund@kunden.se',
      subject: 'AKUT: Leveransproblem — behöver besked idag',
      snippet:
        'Hej, vi har en kund som väntar på en leverans som skulle kommit ' +
        'igår. Vi behöver besked senast idag eller vi förlorar avtalet…',
      mail_id: 'm-esc-1',
    }),
    created_at: hoursAgo(3),
  })

  const escalationStinaMessage = makeStinaMessage({
    thread_id: escalationMailId,
    content: {
      text:
        'Det här ser ut som ett kundärende som inte var tänkt att hanteras ' +
        'av semesterregeln, så jag svarade inte automatiskt. Vill du att ' +
        'jag förbereder ett snabbt svar nu, eller skicka en notis till ' +
        'någon annan på kontoret?',
    },
    created_at: hoursAgo(3),
  })

  // ─── Action_blocked entry recording the collision-handling decision ──
  const actionBlocked = makeActivityLogEntry('action_blocked', {
    id: 'vac-blocked-001',
    thread_id: escalationMailId,
    summary:
      'Skulle ha auto-svarat enligt semesterregeln, men mailet ser ut som ' +
      'en kund-eskalering — eskalerade istället till dig.',
    severity: 'high',
    created_at: hoursAgo(3),
    details: {
      intended_tool_id: 'mail.reply',
      blocker: 'instruction permits judgment; customer escalation detected',
      chosen_alternative: 'escalate',
      alternative_summary:
        'Surfaced this thread for your decision instead of auto-replying.',
    },
  })

  // ─── Four background threads (auto-replied) ─────────────────────────
  const autoMailThreads = autoMailIds.map((id, i) =>
    makeBackgroundThread({
      id,
      trigger: { kind: 'mail', extension_id: 'stina-ext-mail', mail_id: `m-auto-${i + 1}` },
      title: ['Q3-budget — utkast', 'Sprint review-anteckningar', 'Tjänsteresa till Berlin', 'Office-flytt'][i] ?? 'Mail',
      status: 'quiet',
      created_at: hoursAgo(6 + i),
      last_activity_at: hoursAgo(6 + i),
    })
  )

  const autoMailMessages = autoMailIds.flatMap((threadId, i) => {
    const appMsg = makeAppMessage({
      thread_id: threadId,
      content: makeAppContent('mail', {
        from: ['anna@example.com', 'erik@example.com', 'maria@example.com', 'office-admin@example.com'][i] ?? 'a@b.com',
        subject: ['Q3-budget — utkast', 'Sprint review-anteckningar', 'Tjänsteresa till Berlin', 'Office-flytt'][i] ?? 'Mail',
        snippet: 'Behöver din input innan vi går vidare…',
        mail_id: `m-auto-${i + 1}`,
      }),
      created_at: hoursAgo(6 + i),
    })
    const stinaReasoning = makeStinaMessage({
      thread_id: threadId,
      visibility: 'silent',
      content: {
        text:
          'Standing instruction matches; not a customer escalation; using ' +
          'the vacation-reply auto-policy.',
      },
      created_at: hoursAgo(6 + i),
    })
    return [appMsg, stinaReasoning]
  })

  // Auto-action entries for the four silent replies
  const autoActions = autoMailIds.map((threadId, i) =>
    makeActivityLogEntry('auto_action', {
      id: `vac-auto-${i + 1}`,
      thread_id: threadId,
      summary: `Auto-svarade per semesterregel.`,
      severity: 'high',
      created_at: hoursAgo(6 + i),
      details: {
        tool_id: 'mail.reply',
        policy_id: replyPolicyId,
        standing_instruction_id: vacationInstrId,
      },
    })
  )

  // Memory-change entry recording the standing instruction creation (yesterday)
  const memoryChange = makeActivityLogEntry('memory_change', {
    id: 'vac-mem-001',
    thread_id: null,
    summary: 'Sparat: viktigt minne — semesterregel.',
    severity: 'medium',
    created_at: hoursAgo(48),
    details: {
      memory_kind: 'standing_instruction',
      memory_id: vacationInstrId,
      action: 'create',
    },
  })

  // Dream pass run
  const dreamRun = makeActivityLogEntry('dream_pass_run', {
    id: 'vac-dream-001',
    thread_id: null,
    summary: 'Nattens konsolidering — 4 auto-handlingar loggade, inga flaggor.',
    created_at: hoursAgo(2),
    details: { status: 'completed', tasks: { auto_actions: 4, flags: 0 } },
  })

  return {
    id: 'vacation-mode-active',
    description:
      'Vacation auto-reply active. Four overnight mails auto-handled in ' +
      'background, one customer escalation surfaced via §06 collision handling.',
    threads: [recapThread, escalationThread, ...autoMailThreads],
    messages: [
      recapMessage,
      escalationAppMessage,
      escalationStinaMessage,
      ...autoMailMessages,
    ],
    standing_instructions: [vacationInstr],
    profile_facts: [peterFact],
    thread_summaries: [],
    auto_policies: [replyPolicy],
    activity_log_entries: [
      memoryChange,
      dreamRun,
      actionBlocked,
      ...autoActions,
    ],
  }
}

