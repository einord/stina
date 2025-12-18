import { createImapClient, getImapMessage, type EmailAccount, type EmailMessageDetails } from './index.js';
import { setEmailAccountLastSeen } from '@stina/settings';

type NewMessageCallback = (msg: {
  account: EmailAccount;
  mailbox: string;
  uid: number;
  envelope: EmailMessageDetails;
}) => Promise<void> | void;

type WatchHandle = { stop: () => void };

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
        // TEMP: debug log to verify credentials/connection options end-to-end
        console.warn('[email-debug] IMAP connect payload', {
          user: options.account.username,
          pass: options.account.password,
          host: options.account.imap?.host,
          port: options.account.imap?.port,
          secure: options.account.imap?.secure,
        });
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

  // Try multiple username variants to handle providers that require a specific login name.
  const usernameCandidates = Array.from(
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
  const authMethods: Array<'AUTH=PLAIN' | 'AUTH=LOGIN' | 'LOGIN'> = ['AUTH=PLAIN', 'AUTH=LOGIN', 'LOGIN'];

  let loggedIn = false;
  let lastAuthErr: unknown;
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
        console.warn('[email-debug] IMAP login attempt', {
          host: account.imap?.host,
          port: account.imap?.port,
          secure: account.imap?.secure,
          user,
          method,
        });
        loggedIn = true;
        break;
      } catch (err) {
        lastAuthErr = err;
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
    throw lastAuthErr ?? new Error('IMAP authentication failed');
  }

  if (!client) {
    throw new Error('IMAP client missing after auth');
  }

  let lastSeen = typeof account.lastSeenUid === 'number' && Number.isFinite(account.lastSeenUid) ? account.lastSeenUid : 0;

  const lock = await client.getMailboxLock(mailbox);
  try {
    // Prime lastSeen to the latest UID
    const exists = client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
      ? Number((client.mailbox as { exists?: unknown }).exists ?? 0)
      : 0;
    if (exists > 0) {
      const latest = await client.fetchOne(`${exists}`, { uid: true });
      const latestUid =
        latest && typeof latest === 'object' && 'uid' in latest ? Number((latest as { uid?: unknown }).uid ?? 0) : 0;
      if (latestUid > lastSeen) lastSeen = latestUid;
      await setEmailAccountLastSeen(account.id, lastSeen);
    }

    while (!signal.aborted) {
      const beforeExists = client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
        ? Number((client.mailbox as { exists?: unknown }).exists ?? 0)
        : 0;

      // Wait for changes or timeout (keeps connection alive)
      await (client as unknown as { idle: (opts: { mailbox: string; timeout: number }) => Promise<void> }).idle({
        mailbox,
        timeout: 5 * 60 * 1000,
      });
      if (signal.aborted) break;

      const afterExists = client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
        ? Number((client.mailbox as { exists?: unknown }).exists ?? 0)
        : 0;

      if (afterExists > lastSeen || afterExists > beforeExists) {
        const fromUid = lastSeen > 0 ? lastSeen + 1 : Math.max(1, afterExists - 5);
        const toUid = afterExists;
        const range = `${fromUid}:${toUid}`;

        for await (const msg of client.fetch(range, { uid: true, envelope: true, internalDate: true })) {
          if (signal.aborted) break;
          if (!msg || typeof msg !== 'object' || !('uid' in msg)) continue;
          const uid = Number((msg as { uid?: unknown }).uid ?? 0);
          if (!Number.isFinite(uid) || uid <= lastSeen) continue;
          const full = await getImapMessage(account, mailbox, uid);
          if (full) {
            await onNewMessage({ account, mailbox, uid, envelope: full });
          }
          if (uid > lastSeen) {
            lastSeen = uid;
            await setEmailAccountLastSeen(account.id, lastSeen);
          }
        }
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
