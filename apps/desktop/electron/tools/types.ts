export type JsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchemaProperty =
  | {
      type: 'string' | 'number' | 'integer' | 'boolean';
      description?: string;
    }
  | {
      type: 'object';
      properties?: Record<string, JsonSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
      description?: string;
    }
  | {
      type: 'array';
      items?: JsonSchemaProperty;
      description?: string;
    };

export interface BaseToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

import type { MCPServer } from '@stina/settings';

export type MCPServersState = {
  servers: MCPServer[];
  defaultServer?: string;
};

export interface ToolContext {
  resolveServer(input?: string): Promise<string>;
  listServers(): Promise<MCPServersState>;
  listRemoteTools(url: string): Promise<unknown>;
  callRemoteTool(url: string, tool: string, args: Record<string, unknown>): Promise<unknown>;
  builtinCatalog(): BaseToolSpec[];
  runBuiltin(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface BuiltinTool {
  name: string;
  spec: BaseToolSpec;
  run(args: Record<string, unknown> | undefined, ctx: ToolContext): Promise<unknown>;
}
