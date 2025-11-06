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

export type MCPServersState = {
  servers: Array<{ name: string; url: string }>;
  defaultServer?: string;
};

export interface ToolContext {
  resolveServer(input?: string): Promise<string>;
  listServers(): Promise<MCPServersState>;
  listRemoteTools(url: string): Promise<any>;
  callRemoteTool(url: string, tool: string, args: any): Promise<any>;
  builtinCatalog(): BaseToolSpec[];
  runBuiltin(name: string, args: any): Promise<any>;
}

export interface BuiltinTool {
  name: string;
  spec: BaseToolSpec;
  run(args: any, ctx: ToolContext): Promise<any>;
}
