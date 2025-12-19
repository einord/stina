import { Readable } from 'node:stream';

import { createImapClient, type EmailAccount, type EmailMessageDetails } from './index.js';
import { setEmailAccountLastSeen } from '@stina/settings';
import { simpleParser } from 'mailparser';

type NewMessageCallback = (msg: {
  account: EmailAccount;
  mailbox: string;
  uid: number;
  envelope: EmailMessageDetails;
}) => Promise<void> | void;

type FetchedMessage = {
  uid?: unknown;
  envelope?: {
    subject?: string | null;
    from?: Array<{ name?: string | null; address?: string | null } | null> | null;
    to?: Array<{ name?: string | null; address?: string | null } | null> | null;
  } | null;
  headers?: Map<unknown, unknown> | Record<string, unknown> | Buffer;
  source?: Buffer | string | Readable | null;
  internalDate?: Date | string | number | null;
};

type WatchHandle = { stop: () => void };

// Remember the last successful auth combo per account to avoid repeating failing attempts.
const authHints = new Map<string, { user: string; method: 'AUTH=PLAIN' | 'AUTH=LOGIN' | 'LOGIN' }>();

/**
 * Resolves when a new message EXISTS arrives, the connection closes, abort is triggered, or timeout elapses.
 * This avoids relying on IDLE resolution semantics that differ across servers.
 */
function waitForExistsOrTimeout(
  client: import('imapflow').ImapFlow,
  opts: { timeoutMs: number; signal: AbortSignal },
): Promise<'exists' | 'timeout' | 'closed'> {
  return new Promise((resolve) => {
    let finished = false;
    const cleanup = () => {
      finished = true;
      client.off('exists', onExists);
      client.off('close', onClose);
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
    };
    const onExists = () => {
      if (finished) return;
      cleanup();
      resolve('exists');
    };
    const onClose = () => {
      if (finished) return;
      cleanup();
      resolve('closed');
    };
    const onAbort = () => {
      if (finished) return;
      cleanup();
      resolve('closed');
    };
    const timer = setTimeout(() => {
      if (finished) return;
      cleanup();
      resolve('timeout');
    }, opts.timeoutMs);

    client.on('exists', onExists);
    client.on('close', onClose);
    opts.signal.addEventListener('abort', onAbort, { once: true });
  });
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Starts an IMAP IDLE watcher for a single mailbox. Reconnects on errors with backoff.
 * Used by the desktop main process to drive automation rules (not exposed to UI directly).
 */
export function startImapWatcher(options: {
  account: EmailAccount;
  mailbox?: string;
  onNewMessage: NewMessageCallback;
  signal?: AbortSignal;
}): WatchHandle {
  const mailbox = options.mailbox?.trim() || 'INBOX';
  const abortController = options.signal ? null : new AbortController();
  const abort = options.signal ?? abortController?.signal!;
  const accountLabel =
    options.account.label ||
    options.account.emailAddress ||
    options.account.username ||
    options.account.id ||
    'email account';

  const isAuthError = (err: unknown): boolean => {
    if (!err || typeof err !== 'object') return false;
    const anyErr = err as { authenticationFailed?: unknown; responseStatus?: unknown; responseText?: unknown };
    if (anyErr.authenticationFailed === true) return true;
    const status = typeof anyErr.responseStatus === 'string' ? anyErr.responseStatus.toUpperCase() : '';
    if (status === 'NO') return true;
    const text = typeof anyErr.responseText === 'string' ? anyErr.responseText.toUpperCase() : '';
    return text.includes('AUTHENTICATION') || text.includes('LOGIN FAILED');
  };

  async function runLoop() {
    while (!abort.aborted) {
      try {
        await watchOnce(options.account, mailbox, options.onNewMessage, abort);
      } catch (err) {
        console.warn('[email] watcher error', err);
        if (isAuthError(err)) {
          console.warn(
            `[email] authentication failed for account ${accountLabel}; stopping watcher until credentials are updated. Check username/password, IMAP access, TLS/port, or app-specific password if required by the provider.`,
          );
          break;
        }
      }
      if (!abort.aborted) {
        await sleep(3000, abort);
      }
    }
  }

  void runLoop();

  return {
    stop: () => {
      if (!abort.aborted && abortController) {
        abortController.abort();
      }
    },
  };
}

async function watchOnce(
  account: EmailAccount,
  mailbox: string,
  onNewMessage: NewMessageCallback,
  signal: AbortSignal,
) {
  // ImapFlow types don't ship perfectly with our NodeNext setup; use a loose type to keep lint happy while avoiding circular imports.
  let client: import('imapflow').ImapFlow | null = null;
  const label =
    account.label || account.emailAddress || account.username || account.id || 'email account';

  // Try multiple username variants to handle providers that require a specific login name.
  const usernameCandidatesBase = Array.from(
    new Set(
      [
        account.loginUsername,
        account.username,
        account.emailAddress,
        account.emailAddress?.includes('@') ? account.emailAddress.split('@')[0] : null,
        account.username?.includes('@') ? account.username.split('@')[0] : null,
        // iCloud often requires primary @icloud.com/@me.com for login even if using a custom domain.
        account.username?.includes('@')
          ? `${account.username.split('@')[0]}@icloud.com`
          : account.username
            ? `${account.username}@icloud.com`
            : null,
        account.emailAddress?.includes('@')
          ? `${account.emailAddress.split('@')[0]}@icloud.com`
          : account.emailAddress
            ? `${account.emailAddress}@icloud.com`
            : null,
        account.username?.includes('@')
          ? `${account.username.split('@')[0]}@me.com`
          : account.username
            ? `${account.username}@me.com`
            : null,
        account.emailAddress?.includes('@')
          ? `${account.emailAddress.split('@')[0]}@me.com`
          : account.emailAddress
            ? `${account.emailAddress}@me.com`
            : null,
      ].filter((v) => typeof v === 'string' && v.trim().length > 0) as string[],
    ),
  );
  const hint = authHints.get(account.id);
  const usernameCandidates = hint?.user
    ? [hint.user, ...usernameCandidatesBase.filter((u) => u !== hint.user)]
    : usernameCandidatesBase;

  const baseMethods: Array<'AUTH=PLAIN' | 'AUTH=LOGIN' | 'LOGIN'> = ['LOGIN', 'AUTH=LOGIN', 'AUTH=PLAIN'];
  const authMethods = hint?.method
    ? ([hint.method, ...baseMethods.filter((m) => m !== hint.method)] as typeof baseMethods)
    : baseMethods;

  let loggedIn = false;
  let lastAuthErr: unknown;
  let lastAuthMeta: { user: string; method: (typeof authMethods)[number] } | null = null;
  for (const user of usernameCandidates) {
    for (const method of authMethods) {
      try {
        if (client) {
          try {
            await client.logout();
          } catch {
            /* ignore */
          }
        }
        client = createImapClient(account, { authUser: user, authMethod: method });
        await client.connect();
        console.warn('[email] IMAP login succeeded', {
          host: account.imap?.host,
          port: account.imap?.port,
          secure: account.imap?.secure,
          user,
          method,
        });
        authHints.set(account.id, { user, method });
        loggedIn = true;
        break;
      } catch (err) {
        lastAuthErr = err;
        lastAuthMeta = { user, method };
        const authFailed =
          err &&
          typeof err === 'object' &&
          ((err as { authenticationFailed?: unknown }).authenticationFailed === true ||
            String((err as { responseStatus?: unknown }).responseStatus ?? '').toUpperCase() === 'NO' ||
            String((err as { responseText?: unknown }).responseText ?? '')
              .toUpperCase()
              .includes('AUTH'));
        if (!authFailed) {
          throw err;
        }
        if (client) {
          try {
            await client.logout();
          } catch {
            /* ignore */
          }
          client = null;
        }
      }
    }
    if (loggedIn) break;
  }

  if (!loggedIn) {
    const errText =
      lastAuthErr && typeof lastAuthErr === 'object' && 'responseText' in lastAuthErr
        ? String((lastAuthErr as { responseText?: unknown }).responseText ?? '')
        : '';
    const message = `IMAP authentication failed${
      lastAuthMeta ? ` (user=${lastAuthMeta.user}, method=${lastAuthMeta.method})` : ''
    }${errText ? `: ${errText}` : ''}`;
    const error = new Error(message);
    (error as { cause?: unknown }).cause = lastAuthErr;
    throw error;
  }

  if (!client) {
    throw new Error('IMAP client missing after auth');
  }

  // Always seed lastSeen to the latest UID on startup so we don't replay old messages after downtime.
  let lastSeen = 0;
  try {
    const status = await client.status(mailbox, { messages: true, uidNext: true });
    const messages = Number(status?.messages ?? 0);
    const uidNext = Number(status?.uidNext ?? 0);
    if (uidNext > 0) {
      lastSeen = Math.max(0, uidNext - 1);
    } else if (messages > 0) {
      const latest = await client.fetchOne(`${messages}`, { uid: true });
      const latestUid =
        latest && typeof latest === 'object' && 'uid' in latest ? Number((latest as { uid?: unknown }).uid ?? 0) : 0;
      if (latestUid > 0) lastSeen = latestUid;
    }
    if (lastSeen > 0) {
      await setEmailAccountLastSeen(account.id, lastSeen);
    }
  } catch (err) {
    console.warn('[email] failed to seed lastSeen from status', { account: label, err });
  }

  const lock = await client.getMailboxLock(mailbox);
  try {
    console.info('[email] IMAP watcher started', { account: label, mailbox, lastSeen });
    while (!signal.aborted) {
      const waitResult = await waitForExistsOrTimeout(client, { timeoutMs: 60_000, signal });
      if (signal.aborted || waitResult === 'closed') break;

      const fromUid = lastSeen > 0 ? lastSeen + 1 : 1;
      const range = `${fromUid}:*`;

      let found = false;
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, internalDate: true, source: true, headers: true },
        { uid: true },
      )) {
        if (signal.aborted) break;
        if (!msg || typeof msg !== 'object' || !('uid' in msg)) continue;
        const uid = Number((msg as { uid?: unknown }).uid ?? 0);
        if (!Number.isFinite(uid) || uid <= lastSeen) continue;
        // Update lastSeen early to avoid re-processing on failures.
        if (uid > lastSeen) {
          lastSeen = uid;
          await setEmailAccountLastSeen(account.id, lastSeen);
        }
        try {
          const full = await parseMessageFromFetch(msg);
          await onNewMessage({ account, mailbox, uid, envelope: full });
          console.info('[email] new message delivered to automation', {
            account: label,
            uid,
            subject: full.subject,
          });
        } catch (err) {
          console.warn('[email] failed to parse/deliver message', { account: label, uid, err });
        }
        found = true;
      }
      if (!found && waitResult !== 'timeout') {
        console.info('[email] no new messages found after exists signal', { account: label, lastSeen });
      }
    }
  } finally {
    try {
      lock.release();
    } catch {
      /* ignore */
    }
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

async function parseMessageFromFetch(msg: FetchedMessage): Promise<EmailMessageDetails> {
  const envelope = msg.envelope;
  const from = envelope?.from?.[0]
    ? `${envelope.from[0].name ?? ''} <${envelope.from[0].address ?? ''}>`.trim()
    : null;
  const to = envelope?.to?.[0]
    ? `${envelope.to[0].name ?? ''} <${envelope.to[0].address ?? ''}>`.trim()
    : null;

  const headersObj: Record<string, string> = {};
  const headers = msg.headers;
  try {
    if (headers) {
      const maybeIterable = headers as {
        [Symbol.iterator]?: () => Iterator<[unknown, unknown]>;
        forEach?: (fn: (value: unknown, key: unknown) => void) => void;
      };
      if (typeof maybeIterable?.[Symbol.iterator] === 'function') {
        for (const [k, v] of maybeIterable as Iterable<[unknown, unknown]>) {
          headersObj[String(k).toLowerCase()] = String(v);
        }
      } else if (typeof maybeIterable?.forEach === 'function') {
        maybeIterable.forEach((v, k) => {
          headersObj[String(k).toLowerCase()] = String(v);
        });
      } else if (Buffer.isBuffer(headers)) {
        const lines = headers.toString('utf8').split(/\r?\n/);
        for (const line of lines) {
          const idx = line.indexOf(':');
          if (idx <= 0) continue;
          const key = line.slice(0, idx).trim().toLowerCase();
          const value = line.slice(idx + 1).trim();
          if (!key) continue;
          if (headersObj[key]) continue;
          headersObj[key] = value;
        }
      } else if (typeof headers === 'object' && headers !== null) {
        for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
          headersObj[String(k).toLowerCase()] = String(v);
        }
      }
    }
  } catch {
    // Ignore header parsing issues and fall back to parsed headers if available.
  }

  const parsed = msg.source ? await parseSource(msg.source) : null;
  const internal = msg.internalDate;
  const ts = internal instanceof Date ? internal.getTime() : internal ? new Date(internal).getTime() : null;

  return {
    id: String(msg.uid ?? ''),
    subject: envelope?.subject ?? (parsed?.subject ?? null),
    from,
    to,
    date: ts != null && Number.isFinite(ts) ? ts : parsed?.date ? parsed.date.getTime() : null,
    text: parsed?.text ?? null,
    html: typeof parsed?.html === 'string' ? parsed.html : null,
    headers: headersObj,
  };
}

async function parseSource(source: unknown) {
  if (Buffer.isBuffer(source) || typeof source === 'string') {
    return await simpleParser(source);
  }
  if (source && typeof source === 'object' && typeof (source as { read?: unknown }).read === 'function') {
    const buf = await streamToBuffer(source as Readable);
    return await simpleParser(buf);
  }
  return null;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
