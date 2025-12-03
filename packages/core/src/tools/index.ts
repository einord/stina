/**
 * Central export point for the tools module.
 * Exports infrastructure (base classes, registry) and tool definitions.
 */

// Infrastructure exports
export type { BaseToolSpec, ToolDefinition, ToolHandler } from './infrastructure/base.js';
export { createToolSpecs, createToolSystemPrompt } from './infrastructure/base.js';
export { createBuiltinTools } from './infrastructure/registry.js';
export { parseToolCallsFromText, stripToolCallsFromText } from './infrastructure/text-parser.js';

// Tool definition exports
export * from './definitions/index.js';
export { logToolInvocation } from './definitions/logging.js';
