import type { InteractionMessage } from './types.js';

export type ToolMessageGroup = {
  kind: 'tool-group';
  messages: InteractionMessage[];
};

/**
 * Groups consecutive tool messages together for presentation purposes.
 */
export function groupToolMessages(
  messages: InteractionMessage[],
): Array<InteractionMessage | ToolMessageGroup> {
  const groups: Array<InteractionMessage | ToolMessageGroup> = [];
  let buffer: InteractionMessage[] = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      buffer.push(message);
      continue;
    }

    if (buffer.length) {
      groups.push({ kind: 'tool-group', messages: buffer });
      buffer = [];
    }

    groups.push(message);
  }

  if (buffer.length) {
    groups.push({ kind: 'tool-group', messages: buffer });
  }

  return groups;
}
