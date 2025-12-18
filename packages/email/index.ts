import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

import type { EmailAccount } from '@stina/settings';
import { createDraft, getDraft, markDraftSent, type EmailDraft } from './drafts.js';

export type { EmailAccount } from '@stina/settings';
export type EmailEnvelope = {
  id: string;
  subject: string | null;
  from: string | null;
  to: string | null;
  date: number | null;
};

export type EmailMessageDetails = EmailEnvelope & {
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
};

export { startImapWatcher } from './watcher.js';

/**
 * Connects to an IMAP server using an EmailAccount.
 * Callers must always close the client via client.logout() in a finally block.
 */
export function createImapClient(
  account: EmailAccount,
  opts?: { authUser?: string; authPass?: string; authMethod?: 'AUTH=PLAIN' | 'AUTH=LOGIN' | 'LOGIN' },
): ImapFlow {
  if (!account.imap?.host) throw new Error('IMAP host missing');
  const user = opts?.authUser ?? account.loginUsername ?? account.username;
  const pass = opts?.authPass ?? account.password;
  if (!user) throw new Error('IMAP username missing');
  if (!pass) throw new Error('IMAP password missing');

  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: {
      user,
      pass,
      ...(opts?.authMethod ? { method: opts.authMethod } : {}),
    },
  });

  // Attach resolved creds for optional debug logging upstream.
  (client as unknown as { __stinaAuth?: { user: string; pass: string } }).__stinaAuth = {
    user,
    pass,
  };

  return client;
}

/**
 * Lists recent messages in the given mailbox.
 * @param limit Max number of messages to return.
 */
export async function listImapMessages(
  account: EmailAccount,
  mailbox: string,
  limit: number,
): Promise<EmailEnvelope[]> {
  const client = createImapClient(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const mailboxInfo = client.mailbox as unknown;
      const exists =
        mailboxInfo && typeof mailboxInfo === 'object' && 'exists' in (mailboxInfo as object)
          ? Number((mailboxInfo as { exists?: unknown }).exists ?? 0)
          : 0;
      if (!exists) return [];

      const endSeq = exists;
      const startSeq = Math.max(1, endSeq - Math.max(1, limit) + 1);
      const seqRange = `${startSeq}:${endSeq}`;
      const out: EmailEnvelope[] = [];

      for await (const msg of client.fetch(seqRange, { uid: true, envelope: true, internalDate: true })) {
        const envelope = msg.envelope;
        const from = envelope?.from?.[0]
          ? `${envelope.from[0].name ?? ''} <${envelope.from[0].address ?? ''}>`.trim()
          : null;
        const to = envelope?.to?.[0]
          ? `${envelope.to[0].name ?? ''} <${envelope.to[0].address ?? ''}>`.trim()
          : null;
        const internal = msg.internalDate;
        const ts =
          internal instanceof Date
            ? internal.getTime()
            : internal
              ? new Date(internal).getTime()
              : null;
        out.push({
          id: String(msg.uid ?? ''),
          subject: envelope?.subject ?? null,
          from,
          to,
          date: ts != null && Number.isFinite(ts) ? ts : null,
        });
      }

      // Newest first
      return out.reverse().slice(0, limit);
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Fetches and parses a message by UID.
 */
export async function getImapMessage(
  account: EmailAccount,
  mailbox: string,
  uid: number,
): Promise<EmailMessageDetails | null> {
  const client = createImapClient(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const message = await client.fetchOne(uid, { uid: true, envelope: true, source: true, headers: true });
      if (!message) return null;

      const envelope = message.envelope;
      const from = envelope?.from?.[0]
        ? `${envelope.from[0].name ?? ''} <${envelope.from[0].address ?? ''}>`.trim()
        : null;
      const to = envelope?.to?.[0]
        ? `${envelope.to[0].name ?? ''} <${envelope.to[0].address ?? ''}>`.trim()
        : null;

      const headersObj: Record<string, string> = {};
      if (message.headers) {
        const maybeIterable = message.headers as unknown as {
          [Symbol.iterator]?: () => Iterator<[unknown, unknown]>;
        };
        if (typeof maybeIterable?.[Symbol.iterator] === 'function') {
          for (const [k, v] of maybeIterable as Iterable<[unknown, unknown]>) {
            headersObj[String(k).toLowerCase()] = String(v);
          }
        } else if (Buffer.isBuffer(message.headers)) {
          const lines = message.headers.toString('utf8').split(/\r?\n/);
          for (const line of lines) {
            const idx = line.indexOf(':');
            if (idx <= 0) continue;
            const key = line.slice(0, idx).trim().toLowerCase();
            const value = line.slice(idx + 1).trim();
            if (!key) continue;
            if (headersObj[key]) continue;
            headersObj[key] = value;
          }
        } else if (typeof message.headers === 'object' && message.headers !== null) {
          for (const [k, v] of Object.entries(message.headers as unknown as Record<string, unknown>)) {
            headersObj[String(k).toLowerCase()] = String(v);
          }
        }
      }

      const parsed = message.source ? await simpleParser(message.source) : null;
      const internal = message.internalDate;
      const ts =
        internal instanceof Date ? internal.getTime() : internal ? new Date(internal).getTime() : null;

      return {
        id: String(message.uid ?? ''),
        subject: envelope?.subject ?? (parsed?.subject ?? null),
        from,
        to,
        date:
          ts != null && Number.isFinite(ts)
            ? ts
            : parsed?.date
              ? parsed.date.getTime()
              : null,
        text: parsed?.text ?? null,
        html: typeof parsed?.html === 'string' ? parsed.html : null,
        headers: headersObj,
      };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

function normalizeReplySubject(subject: string | null): string {
  const s = (subject ?? '').trim();
  if (!s) return 'Re:';
  if (/^\s*re:/i.test(s)) return s;
  return `Re: ${s}`;
}

/**
 * Creates a reply draft to an existing message.
 * @param uid Message UID from IMAP.
 */
export async function createReplyDraft(args: {
  account: EmailAccount;
  mailbox: string;
  uid: number;
  bodyText: string;
}): Promise<EmailDraft> {
  const message = await getImapMessage(args.account, args.mailbox, args.uid);
  if (!message) throw new Error('Message not found');
  const to = message.from ?? '';
  if (!to) throw new Error('Cannot reply: missing From address');
  const inReplyTo = message.headers['message-id'] ?? null;
  const references = inReplyTo ? inReplyTo : null;
  const subject = normalizeReplySubject(message.subject);
  return createDraft({
    account: args.account,
    to,
    subject,
    bodyText: args.bodyText,
    mailbox: args.mailbox,
    messageUid: args.uid,
    inReplyTo,
    references,
  });
}

/**
 * Creates a new message draft.
 */
export async function createNewDraft(args: {
  account: EmailAccount;
  to: string;
  subject: string;
  bodyText: string;
}): Promise<EmailDraft> {
  const to = args.to.trim();
  if (!to) throw new Error('Missing recipient');
  const subject = args.subject.trim();
  if (!subject) throw new Error('Missing subject');
  return createDraft({
    account: args.account,
    to,
    subject,
    bodyText: args.bodyText,
  });
}

/**
 * Sends a stored draft via SMTP using the account's SMTP settings.
 */
export async function sendDraft(account: EmailAccount, draftId: string): Promise<{ ok: true; messageId: string }> {
  const draft = getDraft(draftId);
  if (!draft) throw new Error(`Draft not found: ${draftId}`);
  if (draft.status !== 'draft') throw new Error(`Draft is not sendable (status=${draft.status})`);
  if (draft.accountId !== account.id) throw new Error('Draft account mismatch');

  if (!account.smtp?.host) throw new Error('SMTP host missing');
  if (!account.username) throw new Error('SMTP username missing');
  if (!account.password) throw new Error('SMTP password missing');

  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.username, pass: account.password },
  });

  const headers: Record<string, string> = {};
  if (draft.inReplyTo) headers['In-Reply-To'] = draft.inReplyTo;
  if (draft.references) headers['References'] = draft.references;

  const info = await transport.sendMail({
    from: account.emailAddress,
    to: draft.to,
    subject: draft.subject,
    text: draft.bodyText,
    headers,
  });

  markDraftSent(draft.id);

  return { ok: true, messageId: info.messageId };
}
