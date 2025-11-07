import store from '@stina/store';

import type { ToolDefinition } from './base.js';

async function handleNotifyUser(args: any) {
  const message = typeof args?.message === 'string' ? args.message : '';
  if (!message.trim()) {
    return { ok: false, error: 'notify_user requires { message }' };
  }
  const tool = typeof args?.tool === 'string' ? args.tool : undefined;
  try {
    const entry = await store.appendAutomationMessage(tool, message);
    return { ok: true, message_id: entry.id };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export const notificationTools: ToolDefinition[] = [
  {
    spec: {
      name: 'notify_user',
      description: 'Post an automated message from a tool into the chat so the human user sees it.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'What the user should be told.',
          },
          tool: {
            type: 'string',
            description: 'Name of the tool or service sending the notification.',
          },
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
    handler: handleNotifyUser,
  },
];
