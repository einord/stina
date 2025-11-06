import type { BuiltinTool } from '../types.js';

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
    const msg = typeof args?.message === 'string' ? args.message : String(args);
    console.log('[tool:console_log]', msg);
    return { ok: true };
  },
};

export default consoleLogTool;
