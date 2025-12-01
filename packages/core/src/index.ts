/**
 * Simple helper to verify that the core package is wired correctly.
 * Invoke from diagnostics or tests when you just need a console handshake.
 */
export function corePing(): void {
  console.log('[@stina/core] ping');
}

export { ChatManager } from '../../chat/index.js';
export { createProvider } from './providers/index.js';
export {
  runTool,
  toolSpecs,
  toolSystemPrompt,
  builtinToolCatalog,
  refreshMCPToolCache,
  setActiveToolModules,
} from './tools.js';
export { callMCPToolByName } from './tools/infrastructure/mcp-caller.js';
export { setToolLogger } from './log.js';
export { generateNewSessionStartPrompt } from './chat.systemPrompt.js';
export { buildPromptPrelude } from './prompt/promptPrelude.js';
export { startTodoReminderScheduler } from './reminders/todoScheduler.js';
export {
  geocodeLocation as geocodeWeatherLocation,
  fetchCurrentWeather,
  describeWeatherCode,
} from './weather/openMeteo.js';
export {
  startWebSocketMcpServer,
  stopAllMcpServers,
  getRunningMcpProcesses,
} from './mcp-server-manager.js';
export type { StreamEvent, Interaction, InteractionMessage } from '../../chat/index.js';
export type { WarningEvent } from './warnings.js';
export type { BaseToolSpec } from './tools/infrastructure/base.js';
