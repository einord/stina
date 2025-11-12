import { updateUserProfile } from '@stina/settings';

import type { ToolDefinition } from './base.js';

/**
 * Helper to safely extract an unknown value into a Record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Converts errors to user-friendly strings.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Implements the set_user_first_name tool by updating the user profile.
 */
async function handleSetUserFirstName(args: unknown) {
  const payload = toRecord(args);
  const firstName = typeof payload.first_name === 'string' ? payload.first_name.trim() : '';

  if (!firstName) {
    return { ok: false, error: 'set_user_first_name requires a non-empty first_name' };
  }

  try {
    const profile = await updateUserProfile({ firstName });
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Implements the set_user_nickname tool by updating the user profile.
 */
async function handleSetUserNickname(args: unknown) {
  const payload = toRecord(args);
  const nickname = typeof payload.nickname === 'string' ? payload.nickname.trim() : '';

  if (!nickname) {
    return { ok: false, error: 'set_user_nickname requires a non-empty nickname' };
  }

  try {
    const profile = await updateUserProfile({ nickname });
    return { ok: true, profile };
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) };
  }
}

/**
 * Exported tool definitions for user profile management.
 */
export const profileTools: ToolDefinition[] = [
  {
    spec: {
      name: 'set_user_first_name',
      description:
        "Sets or updates the user's first name in their profile. Use this when the user tells you their name.",
      parameters: {
        type: 'object',
        properties: {
          first_name: {
            type: 'string',
            description: "The user's first name",
          },
        },
        required: ['first_name'],
        additionalProperties: false,
      },
    },
    handler: handleSetUserFirstName,
  },
  {
    spec: {
      name: 'set_user_nickname',
      description:
        "Sets or updates the user's nickname in their profile. Use this when the user mentions a preferred name or nickname.",
      parameters: {
        type: 'object',
        properties: {
          nickname: {
            type: 'string',
            description: "The user's preferred nickname",
          },
        },
        required: ['nickname'],
        additionalProperties: false,
      },
    },
    handler: handleSetUserNickname,
  },
];
