/**
 * Simple helper to verify that the core package is wired correctly.
 * Invoke from diagnostics or tests when you just need a console handshake.
 */
export function corePing(): void {
  console.log('[@stina/core] ping');
}

export { ChatManager } from './chat.js';
export { createProvider } from './providers/index.js';
export { runTool, toolSpecs, toolSystemPrompt, builtinToolCatalog } from './tools.js';
export { setToolLogger } from './log.js';
export type { StreamEvent } from './chat.js';
export type { WarningEvent } from './warnings.js';
export type { BaseToolSpec } from './tools/base.js';
