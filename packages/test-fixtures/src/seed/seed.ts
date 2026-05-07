import type Database from 'better-sqlite3'
import type { Scenario } from '../scenarios/types.js'

/**
 * Seed a database with a fixture scenario.
 *
 * Writes through prepared statements rather than the per-package repositories
 * because:
 *   - Fixtures may include data the repositories' guards would reject (e.g.
 *     pre-set surfaced_at on initial create, custom created_at).
 *   - Fixtures need to be inserted in dependency order without going through
 *     the repository layer's transaction wrapping (we run our own transaction
 *     for the whole seed).
 *
 * The caller is responsible for ensuring the schema migrations have run
 * before calling `seed()`. Use `runMigrations` from @stina/adapters-node.
 *
 * Returns the inserted record counts per table for logging/verification.
 */
export interface SeedCounts {
  threads: number
  messages: number
  standing_instructions: number
  profile_facts: number
  thread_summaries: number
  auto_policies: number
  activity_log_entries: number
}

export function seed(db: Database.Database, scenario: Scenario): SeedCounts {
  const insertThread = db.prepare(
    `INSERT INTO threads (
      id, trigger, status, first_turn_completed_at, surfaced_at, notified_at, title, summary,
      linked_entities, created_at, last_activity_at
    ) VALUES (
      @id, @trigger, @status, @first_turn_completed_at, @surfaced_at, @notified_at, @title, @summary,
      @linked_entities, @created_at, @last_activity_at
    )`
  )

  const insertMessage = db.prepare(
    `INSERT INTO messages (
      id, thread_id, author, visibility, source, content, created_at
    ) VALUES (
      @id, @thread_id, @author, @visibility, @source, @content, @created_at
    )`
  )

  const insertInstruction = db.prepare(
    `INSERT INTO standing_instructions (
      id, rule, scope, valid_from, valid_until, invalidate_on,
      source_thread_id, created_at, created_by
    ) VALUES (
      @id, @rule, @scope, @valid_from, @valid_until, @invalidate_on,
      @source_thread_id, @created_at, @created_by
    )`
  )

  const insertFact = db.prepare(
    `INSERT INTO profile_facts (
      id, fact, subject, predicate, source_thread_id,
      last_referenced_at, created_at, created_by
    ) VALUES (
      @id, @fact, @subject, @predicate, @source_thread_id,
      @last_referenced_at, @created_at, @created_by
    )`
  )

  const insertSummary = db.prepare(
    `INSERT INTO thread_summaries (
      thread_id, summary, topics, generated_at, message_count_at_generation
    ) VALUES (
      @thread_id, @summary, @topics, @generated_at, @message_count_at_generation
    )`
  )

  const insertPolicy = db.prepare(
    `INSERT INTO auto_policies (
      id, tool_id, scope, mode, created_at, source_thread_id,
      approval_count, created_by_suggestion
    ) VALUES (
      @id, @tool_id, @scope, @mode, @created_at, @source_thread_id,
      @approval_count, @created_by_suggestion
    )`
  )

  const insertEntry = db.prepare(
    `INSERT INTO activity_log_entries (
      id, kind, severity, thread_id, summary, details, created_at, retention_days
    ) VALUES (
      @id, @kind, @severity, @thread_id, @summary, @details, @created_at, @retention_days
    )`
  )

  const tx = db.transaction((s: Scenario) => {
    for (const t of s.threads) {
      insertThread.run({
        id: t.id,
        trigger: JSON.stringify(t.trigger),
        status: t.status,
        first_turn_completed_at: t.first_turn_completed_at,
        surfaced_at: t.surfaced_at,
        notified_at: t.notified_at,
        title: t.title,
        summary: t.summary,
        linked_entities: JSON.stringify(t.linked_entities),
        created_at: t.created_at,
        last_activity_at: t.last_activity_at,
      })
    }
    for (const m of s.messages) {
      insertMessage.run({
        id: m.id,
        thread_id: m.thread_id,
        author: m.author,
        visibility: m.visibility,
        source: m.author === 'app' ? JSON.stringify(m.source) : null,
        content: JSON.stringify(m.content),
        created_at: m.created_at,
      })
    }
    for (const si of s.standing_instructions) {
      insertInstruction.run({
        id: si.id,
        rule: si.rule,
        scope: JSON.stringify(si.scope),
        valid_from: si.valid_from,
        valid_until: si.valid_until,
        invalidate_on: JSON.stringify(si.invalidate_on),
        source_thread_id: si.source_thread_id,
        created_at: si.created_at,
        created_by: si.created_by,
      })
    }
    for (const f of s.profile_facts) {
      insertFact.run({
        id: f.id,
        fact: f.fact,
        subject: f.subject,
        predicate: f.predicate,
        source_thread_id: f.source_thread_id,
        last_referenced_at: f.last_referenced_at,
        created_at: f.created_at,
        created_by: f.created_by,
      })
    }
    for (const ts of s.thread_summaries) {
      insertSummary.run({
        thread_id: ts.thread_id,
        summary: ts.summary,
        topics: JSON.stringify(ts.topics),
        generated_at: ts.generated_at,
        message_count_at_generation: ts.message_count_at_generation,
      })
    }
    for (const p of s.auto_policies) {
      insertPolicy.run({
        id: p.id,
        tool_id: p.tool_id,
        scope: JSON.stringify(p.scope),
        mode: p.mode,
        created_at: p.created_at,
        source_thread_id: p.source_thread_id,
        approval_count: p.approval_count,
        created_by_suggestion: p.created_by_suggestion ? 1 : 0,
      })
    }
    for (const e of s.activity_log_entries) {
      insertEntry.run({
        id: e.id,
        kind: e.kind,
        severity: e.severity,
        thread_id: e.thread_id,
        summary: e.summary,
        details: JSON.stringify(e.details),
        created_at: e.created_at,
        retention_days: e.retention_days,
      })
    }
  })

  tx(scenario)

  return {
    threads: scenario.threads.length,
    messages: scenario.messages.length,
    standing_instructions: scenario.standing_instructions.length,
    profile_facts: scenario.profile_facts.length,
    thread_summaries: scenario.thread_summaries.length,
    auto_policies: scenario.auto_policies.length,
    activity_log_entries: scenario.activity_log_entries.length,
  }
}

/**
 * Delete all redesign-2026 records from a database. Useful between seed
 * runs in tests so each scenario starts from a clean state.
 *
 * Does NOT touch tables outside the redesign-2026 set (chat_*, scheduler_*,
 * etc.) — those are owned by other packages and would be wiped by their own
 * test setups.
 */
export function clearRedesign2026Tables(db: Database.Database): void {
  db.transaction(() => {
    // Order matters when FKs are enforced: leaves first, then roots.
    db.exec('DELETE FROM activity_log_entries')
    db.exec('DELETE FROM auto_policies')
    db.exec('DELETE FROM thread_summaries')
    db.exec('DELETE FROM profile_facts')
    db.exec('DELETE FROM standing_instructions')
    db.exec('DELETE FROM messages')
    db.exec('DELETE FROM threads')
  })()
}
