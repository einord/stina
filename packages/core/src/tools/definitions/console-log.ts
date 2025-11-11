import { logToolMessage } from '../../log.js';
import type { ToolDefinition } from '../base.js';
import { formatConsoleLogPayload } from '../logging.js';

/**
 * Creates the console_log tool definition.
 * Currently disabled by default as models tend to overuse it.
 */
export function createConsoleLogDefinition(): ToolDefinition {
  async function handleConsoleLog(args: unknown) {
    const payload = toRecord(args);
    const raw = payload.message ?? args;
    const msg = formatConsoleLogPayload(raw);
    logToolMessage(`[tool:console_log] ${msg}`);
    return { ok: true };
  }

  return {
    spec: {
      name: 'console_log',
      description: `**Use sparingly for debugging only.**

Logs a message to Stina's internal console. This is NOT visible to the user.

When to use:
- Debugging complex multi-step operations
- Tracking state during long-running tasks
- Recording intermediate results for troubleshooting

When NOT to use:
- Normal conversation flow - just respond to the user instead
- Confirming tool execution - the tool result already provides feedback
- Every step of your thought process - this creates noise

Keep messages concise and relevant.`,
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Debug message to log. Keep it short and informative.',
          },
        },
        required: ['message'],
        additionalProperties: false,
      },
    },
    handler: handleConsoleLog,
  };
}

/**
 * Ensures an unknown input is treated as a plain record.
 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
