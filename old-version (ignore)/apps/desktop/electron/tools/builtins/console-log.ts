import type { BuiltinTool } from '../types.js';

/**
 * Builtin console logger that developers can trigger via the MCP bridge.
 */
const consoleLogTool: BuiltinTool = {
  name: 'console_log',
  spec: {
    name: 'console_log',
    description: 'Log a short message to the Stina console for debugging or observability.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Text to log. Keep it concise and relevant to the current task.',
        },
      },
      required: ['message'],
      additionalProperties: false,
    },
  },
  async run(args) {
    const record = toRecord(args);
    const message = typeof record.message === 'string' ? record.message : args;
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    console.log('[tool:console_log]', msg);
    return { ok: true };
  },
};

/**
 * Normalizes arbitrary tool args into a record shape.
 */
function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>;
  return {};
}

export default consoleLogTool;
