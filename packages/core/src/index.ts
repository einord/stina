export function corePing(): void {
  console.log('[@stina/core] ping');
}

export { ChatManager } from './chat.js';
export { createProvider } from './providers/index.js';
export { runTool, toolSpecs, toolSystemPrompt } from './tools.js';
export { setToolLogger } from './log.js';
