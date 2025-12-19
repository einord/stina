import crypto from 'node:crypto';

import store from '@stina/store';

import type { EmailAccount } from '@stina/settings';
import { sanitizeEmailField } from './sanitize.js';

export type EmailDraftStatus = 'draft' | 'sent' | 'cancelled';

export type EmailDraft = {
  id: string;
  accountId: string;
  to: string;
  subject: string;
  bodyText: string;
  mailbox: string | null;
  messageUid: number | null;
  inReplyTo: string | null;
  references: string | null;
  status: EmailDraftStatus;
  createdAt: number;
  updatedAt: number;
};

function uid(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Ensures the drafts table exists. Intended to be called opportunistically before usage.
 */
export function ensureEmailDraftsTable() {
  const rawDb = store.getRawDatabase();
  rawDb.exec(`
    create table if not exists eml_drafts (
      id text primary key,
      accountId text not null,
      toText text not null,
      subject text not null,
      bodyText text not null,
      mailbox text,
      messageUid integer,
      inReplyTo text,
      referencesText text,
      status text not null,
      createdAt integer not null,
      updatedAt integer not null
    );
  `);
}

/**
 * Creates a new draft entry and returns it.
 */
export function createDraft(payload: {
  account: EmailAccount;
  to: string;
  subject: string;
  bodyText: string;
  mailbox?: string | null;
  messageUid?: number | null;
  inReplyTo?: string | null;
  references?: string | null;
}): EmailDraft {
  ensureEmailDraftsTable();
  const rawDb = store.getRawDatabase();
  const now = Date.now();
  const id = uid('draft');

  // Sanitize email content fields to prevent storage issues with very large emails
  const sanitizedTo = sanitizeEmailField(payload.to, 10_000);
  const sanitizedSubject = sanitizeEmailField(payload.subject, 10_000);
  const sanitizedBodyText = sanitizeEmailField(payload.bodyText);

  rawDb
    .prepare(
      `insert into eml_drafts (id, accountId, toText, subject, bodyText, mailbox, messageUid, inReplyTo, referencesText, status, createdAt, updatedAt)
       values (@id, @accountId, @toText, @subject, @bodyText, @mailbox, @messageUid, @inReplyTo, @referencesText, @status, @createdAt, @updatedAt)`,
    )
    .run({
      id,
      accountId: payload.account.id,
      toText: sanitizedTo,
      subject: sanitizedSubject,
      bodyText: sanitizedBodyText,
      mailbox: payload.mailbox ?? null,
      messageUid: payload.messageUid ?? null,
      inReplyTo: payload.inReplyTo ?? null,
      referencesText: payload.references ?? null,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

  store.emitChange('email', { kind: 'draft', id });

  return {
    id,
    accountId: payload.account.id,
    to: sanitizedTo,
    subject: sanitizedSubject,
    bodyText: sanitizedBodyText,
    mailbox: payload.mailbox ?? null,
    messageUid: payload.messageUid ?? null,
    inReplyTo: payload.inReplyTo ?? null,
    references: payload.references ?? null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieves a draft by id.
 */
export function getDraft(id: string): EmailDraft | null {
  ensureEmailDraftsTable();
  const rawDb = store.getRawDatabase();
  const row = rawDb
    .prepare(
      `select id, accountId, toText, subject, bodyText, mailbox, messageUid, inReplyTo, referencesText, status, createdAt, updatedAt
       from eml_drafts where id=@id limit 1`,
    )
    .get({ id }) as
    | {
        id: string;
        accountId: string;
        toText: string;
        subject: string;
        bodyText: string;
        mailbox: string | null;
        messageUid: number | null;
        inReplyTo: string | null;
        referencesText: string | null;
        status: EmailDraftStatus;
        createdAt: number;
        updatedAt: number;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    accountId: row.accountId,
    to: row.toText,
    subject: row.subject,
    bodyText: row.bodyText,
    mailbox: row.mailbox ?? null,
    messageUid: typeof row.messageUid === 'number' ? row.messageUid : null,
    inReplyTo: row.inReplyTo ?? null,
    references: row.referencesText ?? null,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Marks a draft as sent.
 */
export function markDraftSent(id: string): boolean {
  ensureEmailDraftsTable();
  const rawDb = store.getRawDatabase();
  const now = Date.now();
  const res = rawDb
    .prepare(`update eml_drafts set status='sent', updatedAt=@updatedAt where id=@id`)
    .run({ id, updatedAt: now });
  if (res.changes) store.emitChange('email', { kind: 'draft', id });
  return Boolean(res.changes);
}
