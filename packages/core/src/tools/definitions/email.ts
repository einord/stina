import { t } from '@stina/i18n';
import { readSettings } from '@stina/settings';
import { createNewDraft, createReplyDraft, getImapMessage, listImapMessages, sendDraft } from '@stina/email';

import type { EmailAccount } from '@stina/settings';
import type { ToolDefinition } from '../infrastructure/base.js';

type EmailListSuccess = {
  ok: true;
  account_id: string;
  mailbox: string;
  messages: Array<{
    id: string;
    subject: string | null;
    from: string | null;
    to: string | null;
    date: number | null;
  }>;
};

type EmailGetSuccess = {
  ok: true;
  account_id: string;
  mailbox: string;
  message: {
    id: string;
    subject: string | null;
    from: string | null;
    to: string | null;
    date: number | null;
    text: string | null;
  };
};

type EmailError = { ok: false; error: string };

/**
 * Resolves an email account from settings.
 * If account_id is omitted, uses the first enabled account.
 */
async function resolveEmailAccount(accountId?: string | null): Promise<EmailAccount> {
  const s = await readSettings();
  const accounts = s.email?.accounts ?? [];
  if (!accounts.length) throw new Error('No email accounts configured');

  if (accountId) {
    const found = accounts.find((a) => a.id === accountId);
    if (!found) throw new Error(`Email account not found: ${accountId}`);
    if (found.enabled === false) throw new Error('Email account is disabled');
    return found;
  }

  const enabled = accounts.find((a) => a.enabled !== false);
  if (!enabled) throw new Error('No enabled email accounts configured');
  return enabled;
}

/**
 * Tool: email_list_messages
 * Lists recent message headers from an IMAP mailbox.
 */
export function createEmailListMessagesDefinition(): ToolDefinition {
  async function handler(args: unknown): Promise<EmailListSuccess | EmailError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const accountId = typeof payload.account_id === 'string' ? payload.account_id : undefined;
      const mailbox = typeof payload.mailbox === 'string' && payload.mailbox.trim() ? payload.mailbox.trim() : 'INBOX';
      const limit = Number(payload.limit ?? 20);
      const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;

      const account = await resolveEmailAccount(accountId);
      const messages = await listImapMessages(account, mailbox, boundedLimit);
      return {
        ok: true,
        account_id: account.id,
        mailbox,
        messages: messages.map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          to: m.to,
          date: m.date,
        })),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'email_list_messages',
      description: t('chat.email_list_messages_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: t('chat.email_account_id_description'),
          },
          mailbox: {
            type: 'string',
            description: t('chat.email_mailbox_description'),
          },
          limit: {
            type: 'integer',
            description: t('chat.email_list_limit_description'),
          },
        },
        additionalProperties: false,
      },
    },
    handler,
  };
}

/**
 * Tool: email_get_message
 * Fetches a single message with parsed plain text.
 */
export function createEmailGetMessageDefinition(): ToolDefinition {
  async function handler(args: unknown): Promise<EmailGetSuccess | EmailError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const accountId = typeof payload.account_id === 'string' ? payload.account_id : undefined;
      const mailbox = typeof payload.mailbox === 'string' && payload.mailbox.trim() ? payload.mailbox.trim() : 'INBOX';
      const idRaw = payload.id ?? payload.uid;
      const uid = Number(idRaw);
      if (!Number.isFinite(uid) || uid <= 0) {
        return { ok: false, error: 'id (uid) must be a positive number' };
      }

      const account = await resolveEmailAccount(accountId);
      const message = await getImapMessage(account, mailbox, uid);
      if (!message) return { ok: false, error: 'Message not found' };

      return {
        ok: true,
        account_id: account.id,
        mailbox,
        message: {
          id: message.id,
          subject: message.subject,
          from: message.from,
          to: message.to,
          date: message.date,
          text: message.text,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'email_get_message',
      description: t('chat.email_get_message_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: t('chat.email_account_id_description'),
          },
          mailbox: {
            type: 'string',
            description: t('chat.email_mailbox_description'),
          },
          id: {
            type: 'integer',
            description: t('chat.email_message_id_description'),
          },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    handler,
  };
}

type EmailDraftSuccess = {
  ok: true;
  draft_id: string;
  account_id: string;
  to: string;
  subject: string;
  body_preview: string;
};

type EmailSendSuccess = {
  ok: true;
  draft_id: string;
  account_id: string;
  message_id: string;
};

/**
 * Tool: email_draft_reply
 * Creates a reply draft for a given message UID.
 */
export function createEmailDraftReplyDefinition(): ToolDefinition {
  async function handler(args: unknown): Promise<EmailDraftSuccess | EmailError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const accountId = typeof payload.account_id === 'string' ? payload.account_id : undefined;
      const mailbox = typeof payload.mailbox === 'string' && payload.mailbox.trim() ? payload.mailbox.trim() : 'INBOX';
      const idRaw = payload.id ?? payload.uid;
      const uid = Number(idRaw);
      const bodyText = typeof payload.body_text === 'string' ? payload.body_text : typeof payload.body === 'string' ? payload.body : '';
      if (!Number.isFinite(uid) || uid <= 0) return { ok: false, error: 'id (uid) must be a positive number' };
      if (!bodyText.trim()) return { ok: false, error: 'body_text is required' };

      const account = await resolveEmailAccount(accountId);
      const draft = await createReplyDraft({ account, mailbox, uid, bodyText });
      return {
        ok: true,
        draft_id: draft.id,
        account_id: account.id,
        to: draft.to,
        subject: draft.subject,
        body_preview: draft.bodyText.slice(0, 280),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'email_draft_reply',
      description: t('chat.email_draft_reply_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: t('chat.email_account_id_description') },
          mailbox: { type: 'string', description: t('chat.email_mailbox_description') },
          id: { type: 'integer', description: t('chat.email_message_id_description') },
          body_text: { type: 'string', description: t('chat.email_body_text_description') },
        },
        required: ['id', 'body_text'],
        additionalProperties: false,
      },
    },
    handler,
  };
}

/**
 * Tool: email_draft_new
 * Creates a new outbound draft.
 */
export function createEmailDraftNewDefinition(): ToolDefinition {
  async function handler(args: unknown): Promise<EmailDraftSuccess | EmailError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const accountId = typeof payload.account_id === 'string' ? payload.account_id : undefined;
      const to = typeof payload.to === 'string' ? payload.to : '';
      const subject = typeof payload.subject === 'string' ? payload.subject : '';
      const bodyText = typeof payload.body_text === 'string' ? payload.body_text : typeof payload.body === 'string' ? payload.body : '';
      if (!to.trim()) return { ok: false, error: 'to is required' };
      if (!subject.trim()) return { ok: false, error: 'subject is required' };
      if (!bodyText.trim()) return { ok: false, error: 'body_text is required' };

      const account = await resolveEmailAccount(accountId);
      const draft = await createNewDraft({ account, to, subject, bodyText });
      return {
        ok: true,
        draft_id: draft.id,
        account_id: account.id,
        to: draft.to,
        subject: draft.subject,
        body_preview: draft.bodyText.slice(0, 280),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'email_draft_new',
      description: t('chat.email_draft_new_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: t('chat.email_account_id_description') },
          to: { type: 'string', description: t('chat.email_to_description') },
          subject: { type: 'string', description: t('chat.email_subject_description') },
          body_text: { type: 'string', description: t('chat.email_body_text_description') },
        },
        required: ['to', 'subject', 'body_text'],
        additionalProperties: false,
      },
    },
    handler,
  };
}

/**
 * Tool: email_send_draft
 * Sends a previously created draft. Requires explicit user confirmation.
 */
export function createEmailSendDraftDefinition(): ToolDefinition {
  async function handler(args: unknown): Promise<EmailSendSuccess | EmailError> {
    try {
      const payload = typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
      const accountId = typeof payload.account_id === 'string' ? payload.account_id : undefined;
      const draftId = typeof payload.draft_id === 'string' ? payload.draft_id : '';
      const confirmed = payload.confirmed === true || payload.user_confirmed === true;
      if (!draftId.trim()) return { ok: false, error: 'draft_id is required' };

      const account = await resolveEmailAccount(accountId);
      const settings = await readSettings();
      const rule =
        settings.email?.rules?.find((r) => r.accountId === account.id && r.enabled !== false) ?? null;
      const sendMode = rule?.sendMode ?? 'require_approval';

      if (sendMode === 'blocked') {
        return { ok: false, error: 'Sending is blocked by email settings (send mode: blocked)' };
      }
      if (sendMode !== 'auto_send' && !confirmed) {
        return { ok: false, error: 'User approval required to send this email (confirmed=true)' };
      }
      const allowedConfirmed = sendMode === 'auto_send' ? true : confirmed;
      if (!allowedConfirmed) {
        return { ok: false, error: 'Sending not allowed' };
      }

      const result = await sendDraft(account, draftId.trim());
      return { ok: true, draft_id: draftId.trim(), account_id: account.id, message_id: result.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    spec: {
      name: 'email_send_draft',
      description: t('chat.email_send_draft_tool_description'),
      parameters: {
        type: 'object',
        properties: {
          account_id: { type: 'string', description: t('chat.email_account_id_description') },
          draft_id: { type: 'string', description: t('chat.email_draft_id_description') },
          confirmed: { type: 'boolean', description: t('chat.email_send_confirmed_description') },
        },
        required: ['draft_id', 'confirmed'],
        additionalProperties: false,
      },
    },
    handler,
  };
}
